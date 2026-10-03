#!/usr/bin/env python3
"""Offline scientific A/B source renderer. Not an app/native/device benchmark.

Requires existing GDAL CLI, numpy, Pillow and matplotlib, never downloads grids.
The Node contract is the execution gate; no implicit datum operation is chosen.
"""
import argparse
import copy
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

import numpy as np
from PIL import Image
# Keep cache and bytecode writes in task-owned temporary storage.
sys.dont_write_bytecode = True
os.environ.setdefault('MPLCONFIGDIR',str(Path(tempfile.gettempdir())/'mip-terrain-comparison-matplotlib'))
os.environ.setdefault('XDG_CACHE_HOME',str(Path(tempfile.gettempdir())/'mip-terrain-comparison-cache'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

HERE = Path(__file__).resolve().parent
ENV = {**os.environ, 'PROJ_NETWORK': 'OFF', 'GDAL_PAM_ENABLED': 'NO', 'CPL_VSIL_CURL_ALLOWED_EXTENSIONS': '', 'GDAL_DISABLE_READDIR_ON_OPEN': 'TRUE'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run(argv):
    result = subprocess.run([str(x) for x in argv], env=ENV, capture_output=True, text=True)
    if result.returncode:
        raise ValueError('Offline command failed: '+str(argv)+'\n'+result.stdout+'\n'+result.stderr)
    return result.stdout


def local_file(name):
    if not isinstance(name, str) or '://' in name or name.startswith('/vsi'):
        raise ValueError('Only already-materialized local files are allowed')
    path = Path(name).resolve(strict=True)
    if not path.is_file():
        raise ValueError('Input must be a local regular file')
    return path


def verify_file(binding):
    path = local_file(binding['path'])
    data = path.read_bytes()
    if len(data) != binding['bytes'] or digest(data) != binding['sha256']:
        raise ValueError('Exact input byte/hash mismatch: '+str(path))
    return path


def inspect_ortho(source):
    """Validate encoded and documented planar RGB hashes; never infer admission."""
    archive = verify_file(source['binding'])
    with zipfile.ZipFile(archive) as package:
        for key in ('runtimeProvenance','metadataXml'):
            item=source[key]; data=package.read(item['name'])
            if len(data)!=item['byteLength'] or digest(data)!=item['sha256']:
                raise ValueError('Exact retained metadata/provenance hash mismatch')
        provenance=json.loads(package.read(source['runtimeProvenance']['name']))
        provenance_tiles={item['name']:item for item in provenance['tiles']}
        for tile in source['tiles']:
            original=provenance_tiles[tile['name']]
            for field in ('sha256','byteLength','width','height','bounds','rgbSha256','pixelOrder'):
                if original[field]!=tile[field]:
                    raise ValueError('Tile source record disagrees with hash-bound runtime provenance: '+field)
            if digest(package.read(tile['name']))!=tile['sha256']:
                raise ValueError('Resident tile bytes differ from authenticated package member')
    arrays, receipts = [], []
    for tile in source['tiles']:
        path = verify_file({'path':tile['path'], 'bytes':tile['byteLength'], 'sha256':tile['sha256']})
        with Image.open(path) as im:
            if im.mode != 'RGB' or im.size != (tile['width'],tile['height']):
                raise ValueError('Expected exact RGB tile dimensions, no implicit channel conversion')
            array = np.asarray(im).copy()
        if tile['pixelOrder'] != 'planar RGB' or digest(array.transpose(2,0,1).tobytes()) != tile['rgbSha256']:
            raise ValueError('Documented band-planar pixel hash mismatch')
        arrays.append(array)
        receipts.append({'path':str(path),'sha256':tile['sha256'],'bytes':tile['byteLength'],
                         'planarRgbSha256':tile['rgbSha256'],'interleavedRgbSha256':digest(array.tobytes()),
                         'size':[tile['width'],tile['height']],'bounds':tile['bounds']})
    # Mosaic placement comes only from exact provenance bounds; no guessed order,
    # manual offset, stretch-to-fit or use of screenshot pixels is permitted.
    footprint = source['footprint']
    width, height = source['size']
    dx, dy = (footprint[2]-footprint[0])/width, (footprint[3]-footprint[1])/height
    mosaic = np.empty((height,width,3), dtype=np.uint8)
    occupied = np.zeros((height,width), dtype=bool)
    for tile, array in zip(source['tiles'],arrays):
        left, bottom, right, top = tile['bounds']
        x, y = round((left-footprint[0])/dx), round((footprint[3]-top)/dy)
        w,h = tile['width'],tile['height']
        expected = [footprint[0]+x*dx,footprint[3]-(y+h)*dy,footprint[0]+(x+w)*dx,footprint[3]-y*dy]
        if not np.allclose(expected,tile['bounds'],rtol=0,atol=1e-12) or x<0 or y<0 or x+w>width or y+h>height or occupied[y:y+h,x:x+w].any():
            raise ValueError('Tile provenance does not form the declared nonoverlapping affine grid')
        mosaic[y:y+h,x:x+w] = array
        occupied[y:y+h,x:x+w] = True
    if not occupied.all():
        raise ValueError('Declared mosaic has missing tiles; no zero-fill permitted')
    return mosaic, {'archive':str(archive),'archiveSha256':source['binding']['sha256'], 'tiles':receipts,
                    'mosaicInterleavedRgbSha256':digest(mosaic.tobytes()),'layout':'uint8 interleaved RGB',
                    'footprintAuthority':'retained derivative provenance; not new original TIFF verification'}


def gdal_info(path):
    return json.loads(run(['gdalinfo','-json',path]))


def decode_dem(source, temp):
    path = verify_file(source['binding'])
    info = gdal_info(path)
    if info['size'] != source['size'] or len(info['bands']) != 1 or info['bands'][0]['type'] != 'Float32':
        raise ValueError('DEM dimensions/band/sample type disagree with qualified manifest')
    if not np.allclose(info['geoTransform'],source['geotransform'],rtol=0,atol=1e-9):
        raise ValueError('DEM GeoTransform changed; no alignment-offset allowance')
    if source['horizontalCrs'] not in run(['gdalsrsinfo','-o','epsg',path]):
        raise ValueError('DEM actual CRS disagrees with source record')
    raw = temp/'dem.bin'
    run(['gdal_translate','-q','-of','ENVI','-ot','Float32','-co','INTERLEAVE=BSQ',path,raw])
    header = raw.with_suffix('.hdr').read_text()
    byte_order = re.search(r'byte order\s*=\s*(\d)',header).group(1)
    array = np.fromfile(raw,dtype=('<f4' if byte_order=='0' else '>f4')).reshape(source['size'][1],source['size'][0]).astype('<f4')
    pixel_hash = digest(array.tobytes())
    if pixel_hash != source['samples']['rowMajorLittleEndianSha256']:
        raise ValueError('Canonical row-major little-endian Float32 pixel hash mismatch')
    source['pixelAreaOrPoint']=info.get('metadata',{}).get('',{}).get('AREA_OR_POINT','NOT_DECLARED')
    actual_nodata = info['bands'][0].get('noDataValue')
    if actual_nodata != source['samples']['nodata']:
        raise ValueError('DEM nodata declaration disagrees with source record')
    valid = np.isfinite(array) & (array != actual_nodata)
    if not valid.any():
        raise ValueError('DEM has no valid measured samples')
    for key,actual in [('minimum',float(array[valid].min())),('maximum',float(array[valid].max())),('mean',float(array[valid].astype(np.float64).mean()))]:
        if key in source['samples'] and actual != source['samples'][key]:
            raise ValueError('DEM '+key+' differs from exact numeric qualification')
    return array,valid, {'path':str(path),'sha256':source['binding']['sha256'],'pixelSha256':pixel_hash,
                         'gdalInfo':info,'validCount':int(valid.sum()),'missingCount':int((~valid).sum()),
                         'nonfiniteCount':int((~np.isfinite(array)).sum())}


def largest_valid_rectangle(mask):
    """Deterministic maximal all-valid raster rectangle, no padded/extrapolated pixels."""
    histogram = np.zeros(mask.shape[1],dtype=int)
    best = (0,0,0,0)  # x,y,width,height; deterministic first maximum on ties
    best_area = 0
    for row,line in enumerate(mask):
        histogram = np.where(line,histogram+1,0)
        stack = []
        for col in range(mask.shape[1]+1):
            value = int(histogram[col]) if col<mask.shape[1] else 0
            start = col
            while stack and stack[-1][1]>value:
                index,tall = stack.pop()
                area = tall*(col-index)
                if area>best_area:
                    best_area,best = area,(index,row-tall+1,col-index,tall)
                start = index
            if not stack or stack[-1][1]<value:
                stack.append((start,value))
    return best


def warp_ortho(mosaic, record, temp):
    source,dem = record['sources']['ortho'],record['sources']['dem']
    image = temp/'ortho.png'
    Image.fromarray(mosaic).save(image)
    native = temp/'ortho-provenance-grid.tif'
    b = source['footprint']
    run(['gdal_translate','-q','-of','GTiff','-a_srs',source['horizontalCrs'],'-a_ullr',b[0],b[3],b[2],b[1],image,native])
    dst = temp/'ortho-on-dem-grid.tif'
    b=dem['footprint']; width,height=dem['size']
    command=['gdalwarp','-q','-overwrite','-of','GTiff','-s_srs',source['horizontalCrs'],'-t_srs',dem['horizontalCrs'],
             '-ct',record['registration']['operation']['pipeline'],'-te',*b,'-ts',width,height,'-r','bilinear','-et','0','-dstalpha',native,dst]
    run(command)
    info = gdal_info(dst)
    if info['size'] != dem['size'] or not np.allclose(info['geoTransform'],dem['geotransform'],rtol=0,atol=1e-9):
        raise ValueError('Warp did not preserve exact requested native DEM grid')
    decoded = temp/'ortho-rgba.png'
    run(['gdal_translate','-q','-of','PNG',dst,decoded])
    with Image.open(decoded) as image:
        if image.mode != 'RGBA':
            raise ValueError('Explicit warped alpha coverage required')
        rgba = np.asarray(image).copy()
    return rgba, {'command':list(map(str,command)),'sourceGridAssignment':'provenance bounds; not new GeoKey or registration qualification',
                  'resampling':'bilinear; warp approximation error 0 pixels','offline':True,
                  'rgbaSha256':digest(rgba.tobytes()),'gdalInfo':info}


def render_pair(dem,rgba,window,record,output):
    x,y,w,h=window
    values=dem[y:y+h,x:x+w].astype(float)
    rgb=rgba[y:y+h,x:x+w,:3].astype(float)/255
    settings=record['shared']; gt=record['sources']['dem']['geotransform']
    b=[gt[0]+x*gt[1],gt[3]+(y+h)*gt[5],gt[0]+(x+w)*gt[1],gt[3]+y*gt[5]]
    settings['footprint']=b
    # Derive metre-proportional box aspect once from the actual overlap and keep
    # it identical across A/B; avoid stretching a narrow overlap into a square.
    settings['camera']['boxAspect']=[w*gt[1],h*abs(gt[5]),max(w*gt[1],h*abs(gt[5]))]
    max_edge=settings['render']['meshMaximumEdge']
    cols=np.unique(np.rint(np.linspace(0,w-1,min(w,max_edge))).astype(int))
    rows=np.unique(np.rint(np.linspace(0,h-1,min(h,max_edge))).astype(int))
    origin=float(dem[np.isfinite(dem)&(dem!=record['sources']['dem']['samples']['nodata'])].min())
    elevations=values[np.ix_(rows,cols)]-origin
    xx,yy=np.meshgrid((cols+0.5)*gt[1],(h-rows-0.5)*abs(gt[5]))
    points=np.stack([xx,yy,elevations],axis=-1)
    faces=np.stack([points[:-1,:-1],points[:-1,1:],points[1:,1:],points[1:,:-1]],axis=2).reshape(-1,4,3)
    light=settings['light']; illum=LightSource(azdeg=light['azimuthDegrees'],altdeg=light['altitudeDegrees']).hillshade(values,vert_exag=1,dx=gt[1],dy=abs(gt[5]))
    # Mean all covered source samples in each face; do not imply fine aerial
    # detail survives this declared mesh/colour sampling stage.
    colours=[]; shades=[]
    for y0,y1 in zip(rows[:-1],rows[1:]):
        for x0,x1 in zip(cols[:-1],cols[1:]):
            colours.append(rgb[y0:y1+1,x0:x1+1].mean(axis=(0,1)))
            shades.append(float(illum[y0:y1+1,x0:x1+1].mean()))
    colours=np.asarray(colours); shades=np.asarray(shades)
    lighting=0.35+0.65*shades
    colour_sets=[np.repeat((0.72*lighting)[:,None],3,axis=1),colours*lighting[:,None]]
    render=settings['render']; camera=settings['camera']; variants=[]
    for variant,colours,title in zip(('A','B'),colour_sets,('A — terrain alone','B — ortho plus DEM')):
        figure=plt.figure(figsize=(render['canvasPixels'][0]/render['dpi'],render['canvasPixels'][1]/render['dpi']),dpi=render['dpi'])
        axis=figure.add_subplot(111,projection='3d')
        axis.add_collection3d(Poly3DCollection(faces,facecolors=colours,edgecolors='none',antialiased=False))
        axis.set_proj_type('ortho'); axis.view_init(elev=camera['elevationDegrees'],azim=camera['azimuthDegrees'])
        axis.set_box_aspect(camera['boxAspect']); axis.set_xlim(0,w*gt[1]); axis.set_ylim(0,h*abs(gt[5]))
        # Equal x/y/z metre scaling is retained through boxAspect, including
        # a full horizontal-span z limit rather than exaggerating tiny relief.
        axis.set_zlim(0,camera['boxAspect'][2]); axis.set_xlabel('Local x (m)'); axis.set_ylabel('Local y (m)'); axis.set_zlabel('Source-relative height (m)')
        label=('SYNTHETIC TEST FIXTURE ONLY — NO REAL CLEVELAND DATA'
               if record['evidenceClass']=='SYNTHETIC_TEST_FIXTURE_ONLY'
               else 'ACTUAL SOURCE RESEARCH — UNAPPROVED SOURCE')
        mode_label=('Local coordinates · source-relative metres'
                    if record['mode']=='LOCAL_COORDINATE_RELATIVE_HEIGHT_RESEARCH'
                    else 'Geographic research · separately qualified registration')
        figure.suptitle(title+'\n'+label+'\n'+mode_label,fontsize=10,y=0.98)
        figure.subplots_adjust(top=0.83)
        path=output/(variant+'.png'); figure.savefig(path); plt.close(figure)
        data=path.read_bytes()
        variants.append({'id':variant,'path':str(path),'bytes':len(data),'sha256':digest(data),'shared':copy.deepcopy(settings)})
    spacing=[float(np.diff(cols).max()*gt[1]),float(np.diff(rows).max()*abs(gt[5]))]
    return variants,{'commonWindowPixels':list(map(int,window)),'commonFootprint':b,'commonValidCount':int(w*h),'commonMissingCount':0,
                     'heightOriginMetres':origin,'effectiveMeshSpacingMetres':spacing,'effectiveOrthoColourCellMetres':spacing,
                     'meshDimensions':[len(cols),len(rows)],'quadCount':len(faces),'outputCanvasPixels':render['canvasPixels'],
                     'sourcePixelsToMesh':'evenly selected pixel centres; face colours average bilinear-warped RGB',
                     'retainedOriginalResolutionClaim':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record',required=True)
    parser.add_argument('--output',required=True)
    parser.add_argument('--node',default='node')
    parser.add_argument('--inspect-ortho-only',action='store_true')
    args=parser.parse_args()
    path=local_file(args.record); record=json.loads(path.read_text())
    result=json.loads(run([args.node,HERE/'validate.mjs',path]+([] if args.inspect_ortho_only else ['--ready'])))
    if not result['valid']:
        raise ValueError('Record validation failed: '+str(result))
    output=Path(args.output).resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError('Use a new empty evidence directory; preserve previous receipts')
    output.mkdir(parents=True,exist_ok=True)
    mosaic,ortho_receipt=inspect_ortho(record['sources']['ortho'])
    if args.inspect_ortho_only:
        (output/'ortho-custody.json').write_text(json.dumps({'actualComparisonExecuted':False,'custody':ortho_receipt},indent=2)+'\n')
        print(json.dumps({'status':'ORTHO_CUSTODY_ONLY','comparison':'NOT_EXECUTED','output':str(output)}))
        return
    if record['status']!='NOT_EXECUTED':
        raise ValueError('Renderer takes a preparation record, not an already executed result')
    for executable in ('gdalinfo','gdalsrsinfo','gdal_translate','gdalwarp'):
        if not shutil.which(executable):
            raise ValueError('Missing existing offline GDAL CLI: '+executable+'; no automatic install')
    for grid in record['registration']['operation']['grids']:
        verify_file(grid)
    with tempfile.TemporaryDirectory(prefix='mip-terrain-comparison-') as temp:
        dem,valid,dem_receipt=decode_dem(record['sources']['dem'],Path(temp))
        rgba,warp_receipt=warp_ortho(mosaic,record,Path(temp))
        overlap=valid & (rgba[:,:,3]==255)
        window=largest_valid_rectangle(overlap)
        if min(window[2:])<3:
            raise ValueError('No usable fully valid actual DEM/ortho overlap; no fabricated alignment')
        variants,metrics=render_pair(dem,rgba,window,record,output)
    metrics.update({'demValidCount':dem_receipt['validCount'],'demMissingCount':dem_receipt['missingCount'],
                    'demNonfiniteCount':dem_receipt['nonfiniteCount'],'orthoMissingCount':int((rgba[:,:,3]!=255).sum()),
                    'orthoTotalCount':int(rgba.shape[0]*rgba.shape[1]),'fullGridOverlapCount':int(overlap.sum())})
    try:
        repo=HERE.parent.parent
        source={'commit':run(['git','-C',repo,'rev-parse','HEAD']).strip(),'tree':run(['git','-C',repo,'rev-parse','HEAD^{tree}']).strip(),
                'dirty':bool(run(['git','-C',repo,'status','--porcelain']).strip())}
    except ValueError:
        source={'commit':None,'tree':None,'dirty':None,'exportedSource':'exact harness/contract hashes below'}
    record['status']='EXECUTED'
    record['execution']={'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'harnessSha256':digest(Path(__file__).read_bytes()),'contractSha256':digest((HERE/'contract.mjs').read_bytes()),
        'sourceVersion':source,'variants':variants,'metrics':metrics,'gdalVersion':run(['gdalinfo','--version']).strip(),
        'inputReceipts':{'dem':dem_receipt,'ortho':ortho_receipt,'warp':warp_receipt},'network':'PROJ_NETWORK=OFF; local files only',
        'C':'UNAVAILABLE — geometry and heights absent; no inferred roofs'}
    result_path=output/'record.json'
    result_path.write_text(json.dumps(record,indent=2)+'\n')
    run([args.node,HERE/'validate.mjs',result_path,'--ready'])
    print(json.dumps({'status':'EXECUTED','evidenceClass':record['evidenceClass'],'mode':record['mode'],'output':str(output),'C':'UNAVAILABLE'}))


if __name__=='__main__':
    main()
