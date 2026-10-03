import {readFileSync} from 'node:fs'
import {sha256,validateComparison} from './contract.mjs'
const file = process.argv[2]
if (!file) throw new Error('Usage: node scripts/terrain-comparison/validate.mjs RECORD.json [--ready]')
const record=JSON.parse(readFileSync(file,'utf8'))
const result = validateComparison(record, {requireReady:process.argv.includes('--ready')})
if(result.valid&&process.argv.includes('--verify-artifacts')) {
  if(record.status!=='EXECUTED')result.errors.push('artifact verification requires an executed record')
  for(const item of [...(record.execution.variants??[]),...Object.values(record.sources).map(s=>s.binding)]){
    try{
      if(!item.path||item.path.includes('://')||item.path.startsWith('/vsi'))throw Error('local path required')
      const data=readFileSync(item.path)
      if(data.length!==item.bytes||sha256(data)!==item.sha256)throw Error('byte/hash mismatch')
      if(item.id&&(!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||data.readUInt32BE(16)!==record.shared.render.canvasPixels[0]||data.readUInt32BE(20)!==record.shared.render.canvasPixels[1]))throw Error('PNG dimensions mismatch')
    }catch(error){result.errors.push(`${item.path}: ${error.message}`)}
  }
  if(record.execution.harnessSha256!==sha256(readFileSync(new URL('render.py',import.meta.url)))||record.execution.contractSha256!==sha256(readFileSync(new URL('contract.mjs',import.meta.url))))result.errors.push('receipt source hashes differ from this harness version')
  result.valid=result.errors.length===0
}
console.log(JSON.stringify(result,null,2))
if (!result.valid) process.exitCode = 1
