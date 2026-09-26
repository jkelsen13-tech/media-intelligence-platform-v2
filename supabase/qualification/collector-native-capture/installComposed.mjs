import {installQikIngest, cleanupQikIngest, LOAD_ORDER as QIK_LOAD_ORDER} from '../qik-ingest/installQikIngest.mjs'
import {installCaptureCas, cleanupCaptureCas, LOAD_ORDER as CAS_LOAD_ORDER} from '../content-addressed-storage/installCaptureCas.mjs'
import {createPipelineRpc, drainNativePipeline, enqueueObserved} from '../qik-ingest/nativeHandoff.mjs'

export const COMPOSED_HOLD = true
export {installQikIngest, cleanupQikIngest, installCaptureCas, cleanupCaptureCas}
export {createPipelineRpc, drainNativePipeline, enqueueObserved, QIK_LOAD_ORDER, CAS_LOAD_ORDER}

export async function installComposedCollectorNativeCapture(exec) {
  await installQikIngest(exec)
  await installCaptureCas(exec)
}

export async function cleanupComposedCollectorNativeCapture(exec) {
  // CAS first: it must not CASCADE onto public.articles owned by the collector path.
  await cleanupCaptureCas(exec)
  await cleanupQikIngest(exec)
}
