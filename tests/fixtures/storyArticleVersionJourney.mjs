import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { appStoryFollowingJourneyFixture } from './appStoryFollowingJourney.mjs'
import { createNewsBackend } from '../../src/lib/newsBackend.js'

// Actual restored publication owners and installed SDK. Personal Following
// and unrelated analytical renderers are bounded probes, not live services.
export async function storyArticleVersionJourneyFixture() {
  const browser = globalThis.window, document = globalThis.document
  delete globalThis.window; delete globalThis.document
  let f
  try { f = await appStoryFollowingJourneyFixture() }
  finally { if (browser !== undefined) globalThis.window = browser; if (document !== undefined) globalThis.document = document }
  const correction = await f.ingest({ ...f.article, title: 'NEWER_REPORT_TITLE_TOKEN', summary: 'NEWER_REPORT_SUMMARY_TOKEN' }, 'synthetic-story-article-correction')
  const secondArticleVersion = await f.bindArticle(correction, { kind: 'source_report', claims: [],
    review: 'synthetic-article-v2-review', predecessor: f.firstVersion, reason: 'Synthetic attributed correction with a distinct retained capture.' })
  const v2 = await f.append([secondArticleVersion], f.v1)
  const calls = [], ancillary = []
  let actor = f.viewer, held = null, holdArticle = false, alterArticle = null, followingFailure = 'service_unavailable'
  const json = (data, headers = {}) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', ...headers } })
  const dispatch = async request => {
    const url = new URL(request.url), name = url.pathname.split('/').at(-1)
    const input = url.pathname.includes('/rpc/') ? await request.json() : null
    const call = { name, input, actor: request.headers.get('authorization') }; calls.push(call)
    let data = await f.serial(async () => {
      await f.db.exec('set role anon')
      try {
        if (name === 'read_reviewed_public_article_v1') return f.readArticle(input.p_article_id, input.p_public_version_id)
        if (name === 'read_reviewed_public_story_context_v1') return f.scalar('select public.read_reviewed_public_story_context_v1($1,$2)', [input.p_story_id, input.p_public_version_id])
        if (name === 'news_reviewed_articles_public') {
          const rows = (await f.db.query('select * from public.news_reviewed_articles_public where id=$1', [f.first.article_id])).rows
          return request.headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows
        }
        throw Error('Unexpected bounded SDK endpoint: ' + name)
      } finally { await f.db.exec('reset role') }
    })
    if (name === 'read_reviewed_public_article_v1' && data && alterArticle) data = alterArticle(structuredClone(data))
    if (name === 'read_reviewed_public_article_v1' && holdArticle) {
      holdArticle = false
      await new Promise(resolve => { held = { call, data, release: () => { held = null; resolve() } } })
    }
    return json(data, name === 'news_reviewed_articles_public' ? { 'content-range': `0-0/${Array.isArray(data) ? data.length : data ? 1 : 0}` } : {})
  }
  const client = createClient('https://story-article-fixture.invalid', 'synthetic-public-key', { accessToken: async () => actor,
    global: { fetch: (url, init) => dispatch(new Request(url, init)) } })
  const backend = storyArticleBackend(createNewsBackend(client), ancillary, () => followingFailure, f.graph_node_id)
  return { ...f, correction, secondArticleVersion, v2, calls, ancillary, client, backend, dispatch,
    setActor: value => { actor = value }, holdNextArticle: () => { holdArticle = true }, held: () => held,
    alterArticle: fn => { alterArticle = fn }, followingFailure: value => { followingFailure = value } }
}

export function storyArticleBackend(realNews, ancillary, followingFailure, graphNodeId) {
  const news = { ...realNews, loadStoryDirectory: async () => ({ status: 'unavailable', stories: [] }),
    loadOutletDirectory: async () => [], loadFilteredSourceMetricRows: async () => [],
    loadArticleCitationMap: async () => new Map(), loadEventGrouping: async () => new Map(), loadOutletRegions: async () => new Map([['Synthetic source A','CURRENT_OUTLET_REGION_TOKEN']]),
    loadCorpusMeta: async () => null, loadNewSinceCount: async () => 0 }
  for (const method of ['loadArticleStory','loadArticleGraphLinks','loadSkyVerification','loadArticleTimelineKey','loadArticleComparisonEvents']) {
    news[method] = async () => {
      ancillary.push(method)
      return method === 'loadArticleGraphLinks' ? [{ nodeId: graphNodeId, label: 'CURRENT_ANALYTICAL_HEAD_TOKEN' }]
        : method === 'loadArticleTimelineKey' ? 'current-head-event'
          : method === 'loadArticleComparisonEvents' ? [{ eventId: 'current-head-event', title: 'CURRENT_ANALYTICAL_HEAD_TOKEN' }] : null
    }
  }
  return { investigations: { storyFollowing: { read: async () => ({ data: null, error: { code: followingFailure() } }) } },
    publicData: { news, loadGraph: async () => ({ nodes: [{ id: graphNodeId, type: 'event', label: 'Synthetic canonical vessel subject' }], edges: [], source: 'fixture' }),
      loadGraphCoverage: async () => null, loadNodeLocations: async () => [], loadTopics: async () => null,
      loadCorpusMeta: async () => null, loadInvestigationSurface: async () => null, curated: { loadPhase3BetaFlag: async () => false } } }
}

export async function compileStoryArticleApp(outfile, { platform = 'node', entryPoints = ['src/App.jsx'], stdin } = {}) {
  const require = createRequire(import.meta.url), esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
  await mkdir(new URL('../.compiled/', import.meta.url), { recursive: true })
  await esbuild.build({ absWorkingDir: new URL('../..', import.meta.url).pathname, ...(stdin ? { stdin } : { entryPoints }), outfile,
    bundle: true, platform, format: 'esm', jsx: 'automatic', external: platform === 'node' ? ['react','react/jsx-runtime'] : ['node:crypto'],
    define: { 'import.meta.env': '{"DEV":false,"BASE_URL":"/"}' }, plugins: [{ name: 'bounded-story-article-App', setup(b) {
      b.onResolve({ filter: /^react(?:\/.*)?$/, namespace: 'probe' }, args => ({ path: require.resolve(args.path) }))
      b.onResolve({ filter: /\/(views|panels|graph|components)\// }, args => {
        if (args.path.endsWith('.js') || ['NewsView','NewsStoryReader','StoryFollowingControls','StoryFollowingPanel','SourceAttributionLine'].includes(args.path.split('/').at(-1).replace(/\.jsx$/, ''))) return
        return { path: args.path, namespace: 'probe' }
      })
      b.onResolve({ filter: /\/(mipBackend|auth|usePrivateInvestigationWorkspace)(\.js)?$/ }, args => ({ path: args.path, namespace: 'probe' }))
      b.onLoad({ filter: /.*/, namespace: 'probe' }, args => {
        const name = args.path.split('/').at(-1).replace(/\.jsx$/, '')
        if (name.startsWith('mipBackend')) return { contents: 'export const mipBackend=globalThis.__storyArticleBackend' }
        if (name.startsWith('auth')) return { contents: 'export const useAuthSession=()=>({user:null,loading:false});export const loadAccountUiFlag=async()=>false' }
        if (name.startsWith('usePrivate')) return { contents: 'export const usePrivateInvestigationWorkspace=()=>({status:"unauthenticated",state:{panels:{},bundle:null}})' }
        const stub = `import {createElement} from 'react';const probe=n=>p=>createElement('probe-'+n,p,p.children);export default probe('${name}');`
        if (name === 'InvestigationWorkspace') return { contents: `import {createElement} from 'react';export default p=>createElement('section',{'data-testid':'workspace','data-subject':p.investigationContext.canonical_subject_id,'data-time':p.investigationContext.as_of_time,'data-range':JSON.stringify(p.investigationContext.selected_time_range)},p.searchSlot,p.leftNav,p.details,p.children,createElement('button',{onClick:()=>p.onChangeView('graph')},'Fixture Graph'),createElement('button',{onClick:()=>p.onChangeView('news')},'Fixture News'));export const WorkspaceNavButton=p=>createElement('button',p,p.item.label);export const WorkspaceSearch=p=>createElement('probe-WorkspaceSearch',p);export const WorkspaceAccountButton=p=>createElement('probe-Account',p);export const WorkspaceInfoButton=p=>createElement('probe-Info',p);` }
        if (name === 'PrivateInvestigationWorkspace') return { contents: stub + 'export const PrivateInvestigationInspector=probe("PrivateInvestigationInspector");' }
        return { contents: stub }
      })
      b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }))
    } }] })
}
