// Separate synthetic file: the original wildcard has a dedicated commit test file.
import test from 'node:test'
const root='synthetic commit recorder uses existing encrypted remote journal and actual isolated process restart'
const mark=(kind,name)=>process.stdout.write('SHARD_SELECTION_RECORD '+JSON.stringify({kind,name})+'\n')
if(process.env.MIP_SHARD_SELECTION_CHILD==='synthetic-only'&&process.env.MIP_SHARD_SELECTION_LAYOUT==='two-files'){
 test(root,async t=>{
  mark('root',root)
  await t.test('synthetic commit nested assertion',async sub=>{
   mark('commit','nested')
   await sub.test('synthetic commit deepest assertion',()=>mark('commit','deep'))
  })
 })
}
