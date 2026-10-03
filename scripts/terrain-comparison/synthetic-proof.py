#!/usr/bin/env python3
"""Small deterministic SYNTHETIC_TEST_FIXTURE_ONLY proof of the offline renderer.

Never uses the real source's elevation values or imagery. Generates a 32x32
surface, with a nodata corner, and four RGB tiles in one metre local grid.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import zipfile

import numpy as np
from PIL import Image

HERE=Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True)
    parser.add_argument('--node',default='node')
    args=parser.parse_args()
    output=Path(args.output).resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError('Use a new empty synthetic evidence directory')
    inputs=output/'synthetic-inputs';inputs.mkdir(parents=True,exist_ok=True)
    spec=importlib.util.spec_from_file_location('comparison_renderer',HERE/'render.py'); renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
    # Two behavior checks establish no-overlap refusal and a fully valid crop
    # despite a nodata boundary. They do not assert real-source geometry.
    assert renderer.largest_valid_rectangle(np.zeros((4,4),bool))==(0,0,0,0)
    mask=np.ones((4,4),bool);mask[0,0]=False
    x,y,w,h=renderer.largest_valid_rectangle(mask)
    assert w*h==12 and mask[y:y+h,x:x+w].all()
    yy,xx=np.mgrid[:32,:32]
    dem=(250+xx*0.05+yy*0.025+np.sin(xx/6)*0.1).astype('<f4');dem[0,0]=-999999
    raw=inputs/'dem.bin';raw.write_bytes(dem.tobytes())
    (inputs/'dem.hdr').write_text('ENVI\nsamples = 32\nlines = 32\nbands = 1\nheader offset = 0\nfile type = ENVI Standard\ndata type = 4\ninterleave = bsq\nbyte order = 0\n')
    path=inputs/'dem.tif'
    renderer.run(['gdal_translate','-q','-of','GTiff','-a_srs','EPSG:26917','-a_ullr',100,232,132,200,'-a_nodata',-999999,raw,path])
    footprint=[100,200,132,232];tiles=[]
    rgb=np.stack([(xx*7)%256,(yy*7)%256,((xx+yy)*4)%256],axis=-1).astype(np.uint8)
    for row in range(2):
        for col in range(2):
            name=f'tile-{row}-{col}.png';array=rgb[row*16:(row+1)*16,col*16:(col+1)*16].copy()
            p=inputs/name;Image.fromarray(array).save(p);data=p.read_bytes()
            tiles.append({'name':name,'path':str(p),'byteLength':len(data),'sha256':sha(data),'rgbSha256':sha(array.transpose(2,0,1).tobytes()),'pixelOrder':'planar RGB','width':16,'height':16,'bounds':[100+col*16,232-(row+1)*16,100+(col+1)*16,232-row*16]})
    provenance=json.dumps({'schema':'SYNTHETIC_TEST_FIXTURE_ONLY','tiles':tiles},sort_keys=True).encode()
    metadata=b'<fixture>SYNTHETIC_TEST_FIXTURE_ONLY</fixture>\n'
    archive=inputs/'fixture.zip'
    with zipfile.ZipFile(archive,'w') as package:
        package.writestr('provenance.json',provenance);package.writestr('source-metadata.xml',metadata)
        for tile in tiles: package.write(tile['path'],tile['name'])
    record=json.loads((HERE.parent.parent/'docs/qualification/terrain-comparison-20261003.template.json').read_text())
    common={'authority':'SYNTHETIC_TEST_FIXTURE_ONLY','horizontalCrs':'EPSG:26917','horizontalUnits':'metres','footprint':footprint,'size':[32,32],'pixelOrigin':'affine pixel corners; renderer samples pixel centres','capture':{'exactDay':None,'basis':'synthetic mathematical test fixture; no real capture'}}
    values=dem[dem!=-999999]
    record['sources']={
        'dem':{**common,'id':'SYNTHETIC_DEM','binding':{'status':'BOUND_LOCAL_BYTES','path':str(path),'bytes':path.stat().st_size,'sha256':sha(path.read_bytes())},'geotransform':[100,1,0,232,0,-1],'samples':{'type':'Float32','nodata':-999999,'rowMajorLittleEndianSha256':sha(dem.tobytes()),'minimum':float(values.min()),'maximum':float(values.max()),'mean':float(values.astype(np.float64).mean())}},
        'ortho':{**common,'id':'SYNTHETIC_RGB','binding':{'status':'BOUND_LOCAL_BYTES','path':str(archive),'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes())},'tiles':tiles,'runtimeProvenance':{'name':'provenance.json','byteLength':len(provenance),'sha256':sha(provenance)},'metadataXml':{'name':'source-metadata.xml','byteLength':len(metadata),'sha256':sha(metadata)}}}
    record['evidenceClass']='SYNTHETIC_TEST_FIXTURE_ONLY';record['mode']='LOCAL_COORDINATE_RELATIVE_HEIGHT_RESEARCH'
    pipeline='+proj=noop'
    record['registration'].update({'sourceCrs':'EPSG:26917','targetCrs':'EPSG:26917','status':'RESEARCH_UNQUALIFIED','operation':{'pipeline':pipeline,'sha256':sha(pipeline.encode()),'sourceCrs':'EPSG:26917','targetCrs':'EPSG:26917','axisConvention':'easting,northing identity synthetic grid','gridRequirementBasis':'explicit noop has no grid steps','grids':[],'networkEnabled':False}})
    record['height']['sourceBasis']='synthetic mathematical source-relative metres; not NAVD88, geoid or surveyed ground'
    record['shared']['footprint']=footprint;record['shared']['requestedNativeFootprint']=footprint;record['shared']['camera']['boxAspect']=[32,32,32]
    record['shared']['render'].update({'canvasPixels':[800,600],'meshMaximumEdge':17})
    preparation=output/'synthetic-preparation.json';preparation.write_text(json.dumps(record,indent=2)+'\n')
    subprocess.run(['python3',str(HERE/'render.py'),'--record',str(preparation),'--output',str(output/'synthetic-render'),'--node',args.node],check=True)
    subprocess.run([args.node,str(HERE/'validate.mjs'),str(output/'synthetic-render/record.json'),'--ready','--verify-artifacts'],check=True)


if __name__=='__main__':
    main()
