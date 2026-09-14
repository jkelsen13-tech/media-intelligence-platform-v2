// Shared byte bound; callers also impose lifecycle deadlines. No payload logging.
export async function readPrivateMarketsJson(body,maximum,signal){
 if(!body?.getReader)throw Error('invalid_json')
 const reader=body.getReader(),chunks=[];let size=0
 const cancel=()=>{void reader.cancel().catch(()=>{})}
 signal?.addEventListener('abort',cancel,{once:true})
 try{
  for(;;){if(signal?.aborted)throw Error('aborted');const {value,done}=await reader.read();if(done)break
   size+=value.byteLength;if(size>maximum){cancel();throw Error('body_limit')}chunks.push(value)}
  if(signal?.aborted)throw Error('aborted')
  const bytes=new Uint8Array(size);let offset=0
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
 }finally{signal?.removeEventListener('abort',cancel);reader.releaseLock()}
}
