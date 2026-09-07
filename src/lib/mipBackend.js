import { supabase } from './supabase.js'
import { createInvestigationBackend } from './investigationBackend.js'
import { createPublicDataBackend } from './publicDataBackend.js'

// Production backend composition root. Construction performs no requests.
// Both domains share one configured client, retaining their access contracts.
export const mipBackend = Object.freeze({
  investigations: createInvestigationBackend(supabase),
  publicData: createPublicDataBackend(supabase),
})
