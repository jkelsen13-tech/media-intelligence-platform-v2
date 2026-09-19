// Presentation state only. This is not authentication and carries no credential.
// Private hosting must authenticate every HTML/asset request before serving it.
export function createDemoSession() {
  return Object.freeze({ kind: 'private_demo_presentation', displayName: 'Demo reviewer', presentationLabel: 'Private preview',
    backendAuthority: false, authentication: 'hosting_boundary_required' })
}

export function authorizeDemoMutation() {
  return Object.freeze({ allowed: false, reason: 'Demo presentation sessions cannot authorize backend operations.' })
}
