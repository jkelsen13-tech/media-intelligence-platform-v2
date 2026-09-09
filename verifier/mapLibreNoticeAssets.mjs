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
  function visit(path, descend=true){
    if(visited.has(path))return
    visited.add(path)
    const record=packages[path]
    if(!record||!allowed.has(record.license))throw new Error('Unreviewed MapLibre dependency license: '+path)
    const directory=resolve(root,path)
    const names=readdirSync(directory).filter(n=>/^(licen[cs]e|copying|notice)([.-]|$)/i.test(n))
    // This exact package embeds its full MIT grant in README, not LICENSE.
    // Preserve the installed README, not a reconstructed or generic notice.
    if(path==='node_modules/murmurhash-js'&&record.version==='1.0.0'){
      const readme=readFileSync(resolve(directory,'README.md'),'utf8')
      for(const required of ['## License (MIT)','Copyright (c) 2011 Gary Court',
        'Permission is hereby granted, free of charge','The above copyright notice and this permission notice',
        'THE SOFTWARE IS PROVIDED "AS IS"'])if(!readme.includes(required))throw new Error('Missing embedded MurmurHash license')
      names.push('README.md')
    }else if(!names.some(n=>/^(licen[cs]e|copying)([.-]|$)/i.test(n)))throw new Error('Missing MapLibre dependency license: '+path)
    const files=[]
    for(const name of names.sort()){
      const fileName='licenses/maplibre/'+path.replaceAll('node_modules/','')+'/'+name
      assets.push({type:'asset',fileName,source:readFileSync(resolve(directory,name))})
      files.push(fileName)
    }
    inventory.push({path,version:record.version,license:record.license,integrity:record.integrity,files})
    if(descend)for(const name of Object.keys(record.dependencies??{}).sort())visit(dependency(path,name))
  }
  visit('node_modules/maplibre-gl')
  // Exact notices for every added/updated deck.gl compatibility package.
  for(const path of ["node_modules/@deck.gl/core","node_modules/@deck.gl/layers","node_modules/@luma.gl/core","node_modules/@luma.gl/engine","node_modules/@luma.gl/shadertools","node_modules/@luma.gl/webgl","node_modules/mjolnir.js","node_modules/@deck.gl/maplibre","node_modules/@luma.gl/gpgpu","node_modules/@luma.gl/webgpu","node_modules/@webgpu/types"])visit(path,false)
  assets.push({type:'asset',fileName:'licenses/maplibre/inventory.json',source:JSON.stringify(inventory,null,2)+'\n'})
  return assets
}
