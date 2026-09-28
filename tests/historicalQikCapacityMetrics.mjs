// GNU time process metrics are observations, never route qualification.
export function parseCapacityResource(stderr){
 const fail=()=>{throw Error('capacity_measurement_invalid')}
 if(typeof stderr!=='string'||Buffer.byteLength(stderr)>65536)fail()
 const lines=stderr.split(/\r?\n/).filter(s=>s.startsWith('CAPACITY_RESOURCE'))
 if(lines.length!==1)fail()
 const m=/^CAPACITY_RESOURCE (\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (\d+) (\d+(?:\.\d+)?)$/.exec(lines[0])
 if(!m)fail()
 const metric={user_cpu_ms:Number(m[1])*1000,system_cpu_ms:Number(m[2])*1000,
  peak_rss_bytes:Number(m[3])*1024,wall_ms:Number(m[4])*1000}
 if(!Object.values(metric).every(Number.isFinite)||!Number.isSafeInteger(metric.peak_rss_bytes)||
  metric.peak_rss_bytes<=0||metric.wall_ms<=0)fail()
 return {...metric,source:'GNU time wait4; Linux KiB RSS',
  scope:'whole fresh Deno process including startup,imports,stdin,connect,invocation,close',
  edge_threshold_exceeded:metric.user_cpu_ms+metric.system_cpu_ms>=2000||metric.peak_rss_bytes>=256*1024*1024}
}
