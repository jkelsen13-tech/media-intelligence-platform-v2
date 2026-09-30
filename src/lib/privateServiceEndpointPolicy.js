// Production release extension point: populate only after independent approval of
// each exact deployed HTTPS URL, service contract, authentication and Pages CORS.
// Environment variables cannot approve destinations that receive session tokens.
// No service endpoint has been approved here; this is intentionally disabled.
export const PRIVATE_SERVICE_ENDPOINT_POLICY = Object.freeze({
  hypothesisEndpoint: Object.freeze([]),
  privateMarketsEndpoint: Object.freeze([]),
})
