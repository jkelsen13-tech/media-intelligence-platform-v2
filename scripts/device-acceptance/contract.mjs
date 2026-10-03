import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

const documents=new URL('../../docs/device-acceptance/',import.meta.url)
export const journeys=JSON.parse(readFileSync(new URL('journeys.json',documents),'utf8'))
export const schema=JSON.parse(readFileSync(new URL('record.schema.json',documents),'utf8'))
export const newAcceptanceRecord=()=>JSON.parse(readFileSync(new URL('record-template.json',documents),'utf8'))

// Small dependency-free validator for this closed schema, followed by explicit
// evidence-promotion guards. No external network, accounts or schema mutation.
export function validateAcceptanceRecord(value){
  const errors=[]
  const inspect=(rule,item,path)=>{
    if(rule.$ref)rule=schema.$defs[rule.$ref.split('/').at(-1)]
    if(rule.anyOf){if(!rule.anyOf.some(candidate=>{const before=errors.length;inspect(candidate,item,path);const ok=errors.length===before;errors.splice(before);return ok}))errors.push(path+': no allowed type');return}
    const type=item===null?'null':Array.isArray(item)?'array':typeof item
    const types=Array.isArray(rule.type)?rule.type:[rule.type]
    if(rule.type&&!types.includes(type)&&!(type==='number'&&types.includes('integer')&&Number.isInteger(item))){errors.push(path+': wrong type');return}
    if(rule.const!==undefined&&JSON.stringify(item)!==JSON.stringify(rule.const))errors.push(path+': wrong constant')
    if(rule.enum&&!rule.enum.includes(item))errors.push(path+': unsupported value')
    if(typeof item==='string'&&rule.pattern&&!new RegExp(rule.pattern).test(item))errors.push(path+': invalid format')
    if(typeof item==='string'&&rule.minLength&&item.length<rule.minLength)errors.push(path+': empty value')
    if(typeof item==='number'&&(!Number.isFinite(item)||(rule.minimum!==undefined&&item<rule.minimum)))errors.push(path+': invalid measurement')
    if(type==='object'){
      for(const key of rule.required??[])if(!Object.hasOwn(item,key))errors.push(path+'.'+key+': required')
      for(const [key,entry] of Object.entries(item)){
        if(rule.properties?.[key])inspect(rule.properties[key],entry,path+'.'+key)
        else if(rule.additionalProperties===false)errors.push(path+'.'+key+': unknown field')
        else if(typeof rule.additionalProperties==='object')inspect(rule.additionalProperties,entry,path+'.'+key)
      }
    }
    if(type==='array')for(const [i,entry]of item.entries())if(rule.items)inspect(rule.items,entry,`${path}[${i}]`)
  }
  inspect(schema,value,'record')
  if(errors.length)return {valid:false,errors}
  const browser=value.evidenceKind==='browser_emulation', perf=value.performance
  if(browser&&(!['not_measured','observed_browser_only'].includes(perf.status)||perf.metrics.some(m=>m.scope!=='browser')))
    errors.push('browser evidence cannot qualify physical-device performance')
  if(browser&&perf.thermal.status!=='unknown')errors.push('browser evidence cannot establish device thermal state')
  if(browser&&(value.device.physicalEvidence.length||value.visual.finalOwnerAccepted||value.visual.status==='accepted'))
    errors.push('browser evidence cannot establish physical or final owner visual acceptance')
  if(value.visual.status==='accepted'||value.visual.finalOwnerAccepted){
    if(!value.visual.finalOwnerAccepted||!value.visual.owner||!value.visual.evidence.length)errors.push('final visual acceptance requires recorded owner and evidence')
    for(const [kind,admission]of Object.entries(value.admissions))if(admission.status!=='admitted'||!admission.sourceVersion||!admission.providerProvenance||!admission.evidence.length)errors.push(`final visual acceptance requires admitted real ${kind} exact version/provider evidence`)
  }
  if(perf.status==='passed'){
    if(!perf.acceptedContractReference||!perf.metrics.length)errors.push('performance pass requires exact accepted measurement contract and observations')
    if(perf.thermal.status!=='measured'||!perf.thermal.method||!perf.thermal.evidence.length)errors.push('performance pass requires measured thermal qualification')
  }
  if(perf.thermal.status==='unknown'&&[perf.thermal.state,perf.thermal.method,perf.thermal.ambientCelsius].some(v=>v!==null))errors.push('unknown thermal state must remain null')
  if(value.evidenceKind==='owner_physical_device'&&[value.functional.status,value.visual.status,perf.status].some(s=>['passed','accepted'].includes(s))
    &&(!value.device.model||!value.device.osVersion||!value.device.physicalEvidence.length||!value.recordedAt||!value.source.candidateCommit))errors.push('physical result requires actual device/source/time provenance')
  for(const check of value.functional.checks){
    if(!journeys.journeys.some(j=>j.id===check.journeyId))errors.push('unknown journey '+check.journeyId)
    if(check.status==='passed'&&(!check.observation||!check.evidence.length))errors.push('passed functional check requires observation/evidence')
  }
  if(value.functional.status==='passed'&&(!value.functional.checks.length||value.functional.checks.some(c=>c.status!=='passed')))errors.push('functional summary cannot pass unfinished checks')
  if(value.surfaceCameraBaseline.selectionCompatibility==='unsupported'&&!value.surfaceCameraBaseline.fallbackDisclosure)errors.push('unsupported selection requires fallback disclosure')
  return {valid:errors.length===0,errors}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const file=process.argv[2]
  if(!file)throw Error('Usage: node scripts/device-acceptance/contract.mjs RECORD.json')
  const result=validateAcceptanceRecord(JSON.parse(readFileSync(file,'utf8')))
  console.log(JSON.stringify(result,null,2));if(!result.valid)process.exitCode=1
}
