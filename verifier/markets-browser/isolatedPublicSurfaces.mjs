// Synthetic hosted composition isolation. Private App/workspace code is not mocked.
export const syntheticAppIsolation={name:'isolate-unrelated-public-surfaces',setup(build){
  build.onResolve({filter:/^\.\/(graph|panels|views)\//},args=>{
   if(!args.importer.endsWith('/src/App.jsx') || /\.js$/.test(args.path))return
   return {path:args.path,namespace:'public-view'}
  })
  build.onLoad({filter:/.*/,namespace:'public-view'},()=>({contents:'export default function UnrelatedPublicView(){return null}'}))
  build.onResolve({filter:/\/lib\/(auth|supabase|mipBackend)(\.js)?$/},args=>{
   if(!args.importer.endsWith('/src/App.jsx'))return
   return {path:args.path,namespace:'synthetic-services'}
  })
  build.onLoad({filter:/.*/,namespace:'synthetic-services'},args=>({contents:
   args.path.includes('mipBackend') ? `export const mipBackend={investigations:{},publicData:{
    loadCorpusMeta:async()=>null,loadGraph:async()=>({nodes:[],edges:[],source:'synthetic'}),
    loadGraphCoverage:async()=>null,loadNodeLocations:async()=>[],loadTopics:async()=>null,
    curated:{loadPhase3BetaFlag:async()=>false},loadInvestigationSurface:async()=>null}}` :
   args.path.includes('supabase') ? 'export const supabase=null' :
   'export const loadAccountUiFlag=async()=>false;export function useAuthSession(){return {loading:false,user:null,session:null}}'}))
 }}
