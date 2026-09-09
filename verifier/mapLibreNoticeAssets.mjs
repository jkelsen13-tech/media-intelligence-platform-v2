import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'

// Preserve installed package notices byte-for-byte, with the exact locked
// dependency identity. No network access or package code execution.
export function mapLibreNoticeAssets(root=process.cwd()){
  const packages=JSON.parse(readFileSync(resolve(root,'package-lock.json'),'utf8')).packages
  const allowed=new Set(['MIT','ISC','BSD-2-Clause','BSD-3-Clause','(MIT OR Apache-2.0)'])
  const visited=new Set(), assets=[], inventory=[]
  function dependency(parent,name){
    let p=parent
    for(;;){
      const candidate=(p?p+'/':'')+'node_modules/'+name
      if(packages[candidate])return candidate
      if(!p)throw new Error('Unresolved locked MapLibre dependency: '+name)
      p=p.includes('/node_modules/')?p.slice(0,p.lastIndexOf('/node_modules/')):''
    }
  }
  function visit(path){
    if(visited.has(path))return
    visited.add(path)
    const record=packages[path]
    if(!record||!allowed.has(record.license))throw new Error('Unreviewed MapLibre dependency license: '+path)
    const directory=resolve(root,path)
    const names=readdirSync(directory).filter(n=>/^(licen[cs]e|copying|notice)([.-]|$)/i.test(n))
    if(!names.some(n=>/^(licen[cs]e|copying)([.-]|$)/i.test(n)))throw new Error('Missing MapLibre dependency license: '+path)
    const files=[]
    for(const name of names.sort()){
      const fileName='licenses/maplibre/'+path.replaceAll('node_modules/','')+'/'+name
      assets.push({type:'asset',fileName,source:readFileSync(resolve(directory,name))})
      files.push(fileName)
    }
    inventory.push({path,version:record.version,license:record.license,integrity:record.integrity,files})
    for(const name of Object.keys(record.dependencies??{}).sort())visit(dependency(path,name))
  }
  visit('node_modules/maplibre-gl')
  assets.push({type:'asset',fileName:'licenses/maplibre/inventory.json',source:JSON.stringify(inventory,null,2)+'\n'})
  return assets
}
