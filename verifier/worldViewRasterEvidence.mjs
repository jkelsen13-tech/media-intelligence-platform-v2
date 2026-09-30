// Verification-only PNG measurements. No canvas grading or renderer mutation.
import assert from 'node:assert/strict'
import { inflateSync, deflateSync } from 'node:zlib'

export function decodeScreenshotPng(buffer) {
  assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a')
  let width,height,channels
  const data=[]
  for(let offset=8;offset<buffer.length;){
    const length=buffer.readUInt32BE(offset),type=buffer.toString('ascii',offset+4,offset+8)
    const chunk=buffer.subarray(offset+8,offset+8+length)
    if(type==='IHDR'){
      width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4)
      assert.equal(chunk[8],8,'8-bit screenshot')
      assert.ok([2,6].includes(chunk[9]),'RGB/RGBA screenshot')
      channels=chunk[9]===6?4:3
      assert.equal(chunk[12],0,'non-interlaced screenshot')
    }
    if(type==='IDAT')data.push(chunk)
    offset+=length+12
    if(type==='IEND')break
  }
  assert.ok(width>0&&height>0&&channels)
  const scan=inflateSync(Buffer.concat(data)),stride=width*channels,pixels=Buffer.alloc(stride*height)
  assert.equal(scan.length,(stride+1)*height)
  for(let y=0;y<height;y++){
    const filter=scan[y*(stride+1)];assert.ok(filter<=4)
    for(let x=0;x<stride;x++){
      const left=x>=channels?pixels[y*stride+x-channels]:0
      const up=y?pixels[(y-1)*stride+x]:0
      const upperLeft=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0
      let predictor=0
      if(filter===1)predictor=left
      if(filter===2)predictor=up
      if(filter===3)predictor=Math.floor((left+up)/2)
      if(filter===4){
        const p=left+up-upperLeft,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-upperLeft)
        predictor=a<=b&&a<=c?left:b<=c?up:upperLeft
      }
      pixels[y*stride+x]=(scan[y*(stride+1)+1+x]+predictor)&255
    }
  }
  return {width,height,channels,pixels}
}
export function rasterSummary(image, reference=null) {
  if(reference)assert.deepEqual([image.width,image.height,image.channels],[reference.width,reference.height,reference.channels])
  const measure=(x0,y0,x1,y1)=>{
    let count=0,changed=0,absolute=0,greenExcess=0
    const rgb=[0,0,0]
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const i=(y*image.width+x)*image.channels,values=[image.pixels[i],image.pixels[i+1],image.pixels[i+2]]
      values.forEach((v,k)=>{rgb[k]+=v})
      greenExcess+=Math.max(0,values[1]-(values[0]+values[2])/2);count++
      if(reference){const delta=values.map((v,k)=>Math.abs(v-reference.pixels[i+k]));if(delta.some(Boolean))changed++;absolute+=delta.reduce((a,b)=>a+b,0)}
    }
    return {pixels:count,meanRgb:rgb.map(v=>Number((v/count).toFixed(4))),meanGreenExcess:Number((greenExcess/count).toFixed(4)),
      ...(reference?{changedPixels:changed,changedFraction:changed/count,meanAbsoluteChannelDelta:absolute/(count*3)}:{})}
  }
  return {width:image.width,height:image.height,
    whole:measure(0,0,image.width,image.height),
    center:measure(Math.floor(image.width/4),Math.floor(image.height/4),Math.ceil(image.width*3/4),Math.ceil(image.height*3/4))}
}
// A decoder bug could invent effect evidence. Check each PNG filter against a
// known 2x2 RGB image before any browser measurements. CRC is not interpreted.
export function verifyRasterEvidence(){
  const expected=Buffer.from([255,10,20,30,240,50,60,70,230,90,100,110]),stride=6,channels=3
  for(let filter=0;filter<=4;filter++){
    const scan=Buffer.alloc(14)
    for(let y=0;y<2;y++){scan[y*7]=filter;for(let x=0;x<stride;x++){
      const a=x>=channels?expected[y*stride+x-channels]:0,b=y?expected[(y-1)*stride+x]:0,c=y&&x>=channels?expected[(y-1)*stride+x-channels]:0
      let prediction=[0,a,b,Math.floor((a+b)/2)][filter]
      if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);prediction=pa<=pb&&pa<=pc?a:pb<=pc?b:c}
      scan[y*7+1+x]=(expected[y*stride+x]-prediction)&255
    }}
    const chunk=(name,data)=>{const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(name,4);data.copy(out,8);return out}
    const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(2,4);header[8]=8;header[9]=2
    const image=decodeScreenshotPng(Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]))
    assert.deepEqual(image.pixels,expected)
    assert.equal(rasterSummary(image,image).whole.changedPixels,0)
    assert.equal(rasterSummary(image,{...image,pixels:Buffer.alloc(expected.length)}).whole.changedPixels,4)
  }
}
