import { supabase } from './supabase.js'
import { createInvestigationBackend } from './investigationBackend.js'

// Production backend composition root. Construction performs no requests.
// Public/eligible projections will join through their own access contracts.
export const mipBackend = Object.freeze({ investigations: createInvestigationBackend(supabase) })
