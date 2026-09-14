import {createInterface} from 'node:readline'
import {recordCommittedMetadata} from '../../supabase/qualification/hypothesis-assessments/commitRecorder.mjs'
let next=0
const pending=new Map(),send=value=>process.stdout.write(JSON.stringify(value)+'\n')
const request=(kind,args)=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});send({id,kind,args})})
createInterface({input:process.stdin}).on('line',async line=>{
 const message=JSON.parse(line)
 if(message.reply){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(Error('mip_test_denied')):p.resolve(message.result);return}
 if(message.start){
  try {
   const result=await recordCommittedMetadata({context:message.context,input:message.input,
    journal:{putOnce:(...args)=>request('put',args),get:(...args)=>request('get',args)},
    acknowledge:value=>request('ack',[value])})
   send({done:true,state:result.state})
  }catch{send({done:true,state:'denied'})}
 }
})
