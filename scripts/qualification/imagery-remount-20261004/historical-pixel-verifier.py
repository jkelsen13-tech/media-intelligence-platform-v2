#!/usr/bin/env python3
"""Local actual-App pixel witness; stdlib PNG decoding, no image edits/GDAL."""
import hashlib,json,math,struct,sys,zlib
from pathlib import Path

def sha(value): return hashlib.sha256(value).hexdigest()
def png(path):
    data=Path(path).read_bytes(); assert data[:8]==b'\x89PNG\r\n\x1a\n'
    at=8; compressed=[]; width=height=channels=None
    while at<len(data):
        length=struct.unpack('>I',data[at:at+4])[0]; name=data[at+4:at+8]; body=data[at+8:at+8+length]
        assert zlib.crc32(name+body)&0xffffffff==struct.unpack('>I',data[at+8+length:at+12+length])[0]
        if name==b'IHDR':
            width,height,depth,color,compression,filtering,interlace=struct.unpack('>IIBBBBB',body)
            assert depth==8 and color in (2,6) and compression==filtering==interlace==0
            channels=3 if color==2 else 4
        if name==b'IDAT': compressed.append(body)
        at+=length+12
    raw=zlib.decompress(b''.join(compressed)); stride=width*channels; assert len(raw)==height*(stride+1)
    pixels=bytearray(); previous=bytearray(stride)
    for y in range(height):
        kind=raw[y*(stride+1)]; row=bytearray(raw[y*(stride+1)+1:(y+1)*(stride+1)])
        for x in range(stride):
            a=row[x-channels] if x>=channels else 0; b=previous[x]; c=previous[x-channels] if x>=channels else 0
            if kind==1: predictor=a
            elif kind==2: predictor=b
            elif kind==3: predictor=(a+b)//2
            elif kind==4:
                p=a+b-c; pa,pb,pc=abs(p-a),abs(p-b),abs(p-c); predictor=a if pa<=pb and pa<=pc else b if pb<=pc else c
            else: assert kind==0; predictor=0
            row[x]=(row[x]+predictor)&255
        if channels==4:
            assert all(row[x]==255 for x in range(3,stride,4)); pixels.extend(v for x,v in enumerate(row) if x%4!=3)
        else: pixels.extend(row)
        previous=row
    return {'width':width,'height':height,'rgb':pixels,'sha256':sha(data)}
def pixel(im,x,y):
    at=(y*im['width']+x)*3; return tuple(im['rgb'][at:at+3])
def region(im,r):
    x1,y1,x2,y2=r
    return [pixel(im,x,y) for y in range(y1,y2) for x in range(x1,x2)]
def mean(values): return sum(values)/len(values)
def correlation(a,b):
    ma,mb=mean(a),mean(b); num=sum((x-ma)*(y-mb) for x,y in zip(a,b)); denom=math.sqrt(sum((x-ma)**2 for x in a)*sum((y-mb)**2 for y in b))
    return num/denom if denom else 0

def qualify(directory):
    directory=Path(directory); receipt=json.loads((directory/'browser-receipt.json').read_text()); actual=next(r for r in receipt['receipts'] if r['scenario']=='positive-remount')
    reference=json.loads(Path('/workspace/mip-native-imagery-integration-plan/payload-reference.json').read_text())
    baseline=png(directory/'positive-remount-baseline.png'); active=png(directory/'positive-remount-active.png')
    assert (baseline['width'],baseline['height'])==(active['width'],active['height'])
    f=actual['active']['nativeSourceImagery']['screenFootprint']; w,s,e,n=reference['coverage']['bounds']; results=[]
    for index,tile in enumerate(reference['tiles']):
        source=png('/workspace/mip-real-imagery-evidence/planar-inspection/'+tile['name']); assert source['sha256']==tile['sha256']
        rgb=source['rgb']; planar=b''.join(bytes(rgb[channel::3]) for channel in range(3)); assert sha(planar)==tile['rgbSha256']
        stride=source['width']*3
        upload=b''.join(rgb[y*stride:(y+1)*stride] for y in range(source['height']-1,-1,-1))
        witness=actual['events']['decodeWitness'][index]; assert witness['rgbSha256']==sha(upload) and witness['alphaOpaque'] is True
        tw,ts,te,tn=tile['bounds']; left=f['left']+(tw-w)/(e-w)*(f['right']-f['left']); right=f['left']+(te-w)/(e-w)*(f['right']-f['left'])
        top=f['top']+(n-tn)/(n-s)*(f['bottom']-f['top']); bottom=f['top']+(n-ts)/(n-s)*(f['bottom']-f['top'])
        r=(math.ceil(left)+2,math.ceil(top)+2,math.floor(right)-2,math.floor(bottom)-2); assert r[2]-r[0]>=8 and r[3]-r[1]>=8
        before,after=region(baseline,r),region(active,r); changed=sum(a!=b for a,b in zip(before,after))/len(after)
        difference=mean([abs(a[c]-b[c]) for a,b in zip(before,after) for c in range(3)])
        observed=[]; expected=[]
        # Compare the geographic quadrant's interior sample grid with the actual
        # received RGB tile. Cesium mipmapping/sRGB sampling is not byte identity.
        for y in range(r[1],r[3]):
            for x in range(r[0],r[2]):
                ox=(x+.5-left)/(right-left)*source['width']; oy=(y+.5-top)/(bottom-top)*source['height']
                rx=max(1,round(source['width']/(right-left)/2)); ry=max(1,round(source['height']/(bottom-top)/2))
                area=region(source,(max(0,int(ox)-rx),max(0,int(oy)-ry),min(source['width'],int(ox)+rx),min(source['height'],int(oy)+ry)))
                expect=tuple(mean([p[c] for p in area]) for c in range(3)); value=pixel(active,x,y)
                expected.append(mean(expect)); observed.append(mean(value))
        corr=correlation(observed,expected); error=mean([abs(a-b) for a,b in zip(observed,expected)])
        assert changed>.95 and difference>20 and len(set(after))>30 and corr>.35 and error<35,(tile['name'],changed,difference,corr,error)
        results.append({'tile':tile['name'],'exactEncodedSha256':source['sha256'],'rawNorthUpBandPlanarRgbSha256':sha(planar),'rawNorthUpInterleavedRgbSha256':sha(rgb),'browserUploadPreflippedInterleavedRgbSha256':sha(upload),'nativeTextureOrientation':'cesium-imagebitmap-preflip-y-v1','rect':r,'changedFraction':changed,'meanChannelDifferenceFromBaseline':difference,'distinctColors':len(set(after)),'northUpLuminanceCorrelationWithReceivedTile':corr,'meanLuminanceError':error,'assertion':'PASS'})
    bands=[(math.floor(f['left'])-50,math.ceil(f['top'])+3,math.floor(f['left'])-10,math.floor(f['bottom'])-3),(math.ceil(f['right'])+10,math.ceil(f['top'])+3,math.ceil(f['right'])+50,math.floor(f['bottom'])-3)]
    outside=[]
    for r in bands:
        before,after=region(baseline,r),region(active,r); count=sum(a!=b for a,b in zip(before,after)); assert count==0
        outside.append({'rect':r,'pixels':len(after),'changedPixels':count,'assertion':'PASS_BASELINE_PRESERVED'})
    result={'schema':'mip-native-rgb-actual-app-pixel-witness-v1','status':'PASS','candidate':receipt['candidate'],'sourceFileHashes':receipt.get('sourceFileHashes'),'dirty':receipt.get('dirty',True),'browserReceiptSha256':sha((directory/'browser-receipt.json').read_bytes()),'authority':'SIMULATED_TEST_AUTHORITY_ONLY','genuineReceivedPixels':True,'genuineApplicationAdmitted':False,'renderer':'actual production App facade and Cesium public ImageryProvider','tiles':results,'outsideFootprint':outside,'screenshots':{name:png(directory/name)['sha256'] for name in ['positive-remount-baseline.png','positive-remount-active.png']},'limits':['local Chromium SwiftShader only','no actual source admission or activation','no original TIFF decode','no event-point registration','no full viewport coverage','no GPU/RSS/billing measurement','not appearance acceptance']}
    (directory/'pixel-receipt.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':'PASS','tiles':len(results),'output':str(directory/'pixel-receipt.json')}))
if __name__=='__main__': qualify(sys.argv[1])
