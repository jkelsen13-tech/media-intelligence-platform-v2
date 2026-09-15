// Disposable GitHub service only. Before any fixture database is installed.
import {raw,guard} from '../integrated/transport.mjs'
import {restartRemoteStore} from '../integrated/remoteStoreRestart.mjs'
guard()
await raw('postgres',"alter system set wal_level='logical';")
await restartRemoteStore()
if(await raw('postgres','show wal_level')!=='logical')throw Error('mip_disposable_logical_unavailable')
process.stdout.write('MIP_DISPOSABLE_METADATA_DECODING_READY\n')
