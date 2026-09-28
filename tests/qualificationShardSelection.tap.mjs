// Bounded TAP coverage for these pinned original worker roots, not generic TAP.
const refuse=()=>{throw Error('qualification_shard_tap_refused')}
export function parseQualificationShardTap(tap,{shard,workerRoot,commitRoot,directNames,aNames,sourceLayout='original'}){
 if(typeof tap!=='string'||Buffer.byteLength(tap)>8388608||!['A','B','all'].includes(shard)||
 !Array.isArray(directNames)||directNames.length!==39||new Set(directNames).size!==39||
 !Array.isArray(aNames)||aNames.length!==2||aNames.some(n=>!directNames.includes(n)))refuse()
 if(!['original','synthetic'].includes(sourceLayout))refuse()
 const placeholder=sourceLayout==='original'?'verifier/hypothesis-worker/commitRecorder.test.mjs':'tests/qualificationShardCommit.fixture.mjs'
 const stack=[],completed=[],headers=[]
 for(const line of tap.split('\n')){
  let m=/^( *)# Subtest: (.+)$/.exec(line)
  if(m){
   if(m[1].length%4)refuse()
   const depth=m[1].length/4
   if(depth>16||depth>stack.length)refuse()
   stack.length=depth
   const node={name:m[2],path:[...stack.map(x=>x.name),m[2]],done:false}
   stack.push(node);headers.push(node);continue
  }
  m=/^( *)(not ok|ok) ([1-9][0-9]*) - (.+)$/.exec(line)
  if(!m)continue
  if(m[1].length%4)refuse()
  const depth=m[1].length/4,parts=m[4].split(/\s+#\s+(?=SKIP\b|TODO\b)/i),name=parts[0]
  const skipped=parts.length>1&&/^SKIP\b/i.test(parts[1])
  const todo=parts.length>1&&/^TODO\b/i.test(parts[1])
  let node=stack[depth]
  // Node can emit a skipped result without an accompanying Subtest header.
  if(!node||node.done||node.name!==name){
   if(!skipped&&!(depth===0&&name===placeholder&&shard==='A'))refuse()
   if(depth>stack.length)refuse()
   node={name,path:[...stack.slice(0,depth).map(x=>x.name),name],done:false};headers.push(node)
  }
  if(node.done)refuse()
  node.done=true
  completed.push({path:node.path,skipped,todo,passed:m[2]==='ok'})
  stack.length=depth
 }
 if(headers.some(x=>!x.done))refuse()
 if(completed.some(x=>!x.passed||x.todo))refuse()
 const placeholders=completed.filter(x=>x.path[0]===placeholder)
 if(placeholders.length>1||placeholders.some(x=>x.path.length!==1||!x.passed||x.skipped)||placeholders.length&&shard!=='A')refuse()
 const roots=completed.filter(x=>x.path.length===1&&x.path[0]!==placeholder)
 if(roots.some(x=>![workerRoot,commitRoot].includes(x.path[0]))||
  roots.filter(x=>x.path[0]===workerRoot&&!x.skipped).length!==1)refuse()
 const expected=shard==='all'?directNames:shard==='A'?aNames:directNames.filter(x=>!aNames.includes(x))
 const excluded=directNames.filter(x=>!expected.includes(x))
 const direct=completed.filter(x=>x.path.length===2&&x.path[0]===workerRoot)
 if(new Set(direct.map(x=>x.path[1])).size!==direct.length||direct.some(x=>!directNames.includes(x.path[1])))refuse()
 const executed=direct.filter(x=>!x.skipped).map(x=>x.path[1])
 if(JSON.stringify(executed)!==JSON.stringify(expected))refuse()
 const explicitSkips=direct.filter(x=>x.skipped).map(x=>x.path[1])
 if(explicitSkips.some(x=>!excluded.includes(x)))refuse()
 // Every completed descendant under a selected direct child must execute.
 if(completed.some(x=>x.path[0]===workerRoot&&x.path.length>2&&expected.includes(x.path[1])&&x.skipped))refuse()
 // No descendant may execute below an excluded child, even if its own parent is skipped.
 if(completed.some(x=>x.path[0]===workerRoot&&x.path.length>2&&excluded.includes(x.path[1])&&!x.skipped))refuse()
 const commit=roots.filter(x=>x.path[0]===commitRoot)
 if(commit.length>1)refuse()
 if(shard==='A'){
  if(commit.some(x=>!x.skipped)||completed.some(x=>x.path[0]===commitRoot&&x.path.length>1&&!x.skipped))refuse()
 }else if(commit.length!==1||commit[0].skipped||completed.some(x=>x.path[0]===commitRoot&&x.skipped))refuse()
 return {contract:'qualification_shard_tap_v1',shard,registered_in_source:39,
  direct_reported_in_tap:direct.length,executed_direct:executed,
  excluded_direct:excluded,explicitly_skipped_direct:explicitSkips,
  omitted_direct:excluded.filter(x=>!explicitSkips.includes(x)),
  commit_executed:shard!=='A',worker_root_executed:true,
  filtered_commit_file_placeholder:placeholders.length===1,
  selected_descendants_completed:completed.filter(x=>x.path[0]===workerRoot&&x.path.length>2&&expected.includes(x.path[1])).length}
}
