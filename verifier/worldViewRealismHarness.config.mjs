import base from '../vite.config.js'
export default { ...base, build: { ...base.build, outDir: '/tmp/mip-realism-harness',
  rollupOptions: { ...base.build.rollupOptions, input: 'verifier/worldViewRealismHarness.html' } } }
