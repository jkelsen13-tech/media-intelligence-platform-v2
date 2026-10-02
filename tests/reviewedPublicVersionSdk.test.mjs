import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createReviewedVersionFixture } from './reviewedPublicVersionFixture.mjs'
import { loadArticles, loadArticleDetail } from '../src/lib/supabase.js'
import { createReviewedPublicVersionBackend } from '../src/lib/reviewedPublicVersionBackend.js'
import { normalizeReviewedPublicVersion } from '../src/lib/reviewedPublicVersion.js'

test('actual installed SDK executes reviewed native list/detail/Story projections using current reader roles',async t=>{
  const f=await createReviewedVersionFixture(), requests=[]
  t.after(()=>f.db.close())
  let role='anon', queue=Promise.resolve()
  const client=createClient('https://reviewed-native.example.invalid','synthetic-public-key',{
    accessToken:async()=>`synthetic-${role}`,
    global:{fetch:async(input,init)=>{
      const request=new Request(input,init),url=new URL(request.url),name=url.pathname.split('/').at(-1)
      const requestedRole=role
      requests.push({name,role:requestedRole,authorization:request.headers.get('authorization')})
      let release
      const prior=queue;queue=new Promise(resolve=>{release=resolve});await prior
      try {
        await f.db.exec(`begin;set local role ${requestedRole}`)
        let data, count
        if(url.pathname.includes('/rpc/')){
          const p=await request.json()
          if(name==='read_reviewed_public_story_v1') data=await f.readStory(p.p_story_id,p.p_public_version_id)
          else if(name==='read_reviewed_public_article_v1') data=await f.readArticle(p.p_article_id,p.p_public_version_id)
          else if(name==='read_reviewed_public_story_for_article_v1') data=await f.scalar('select public.read_reviewed_public_story_for_article_v1($1)',[p.p_article_id])
          else if(name==='read_reviewed_public_story_directory_v1') data=await f.scalar('select public.read_reviewed_public_story_directory_v1($1,$2)',[p.p_after,p.p_limit])
          else if(name==='search_reviewed_public_article_ids_v1') data=await f.scalar('select public.search_reviewed_public_article_ids_v1($1,$2)',[p.p_query,p.p_limit])
          else throw Error('unsupported synthetic SDK endpoint')
        }else{
          assert.equal(name,'news_reviewed_articles_public')
          const idFilter=url.searchParams.get('id'),id=idFilter?.startsWith('eq.')?idFilter.slice(3):null
          const ids=idFilter?.startsWith('in.')?idFilter.slice(4,-1).split(','):null
          const rows=(await f.db.query('select id,public_version_id,public_version,published_at,fetched_at from public.news_reviewed_articles_public where ($1::uuid is null or id=$1) and ($2::uuid[] is null or id=any($2)) order by published_at desc nulls last,fetched_at desc',[id,ids])).rows
          count=rows.length
          const single=request.headers.get('accept')?.includes('vnd.pgrst.object')
          if(single && rows.length!==1) return new Response(JSON.stringify({code:'PGRST116',message:'No visible reviewed version',details:'The result contains 0 rows'}),{status:406,headers:{'content-type':'application/json'}})
          data=single?rows[0]:rows.slice(Number(url.searchParams.get('offset')??0),Number(url.searchParams.get('offset')??0)+Number(url.searchParams.get('limit')??30))
        }
        return new Response(JSON.stringify(data),{headers:{'content-type':'application/json',...(count===undefined?{}:{'content-range':`0-${Math.max(0,count-1)}/${count}`})}})
      }catch(e){return new Response(JSON.stringify({code:e.code??'fixture_error',message:e.message}),{status:403,headers:{'content-type':'application/json'}})}
      finally{await f.db.exec('rollback');release()}
    }},
  })
  const versions=createReviewedPublicVersionBackend(client)
  assert.equal((await loadArticles({supabaseClient:client})).total,0)
  assert.equal((await loadArticleDetail(f.first.article_id,{supabaseClient:client})).articleMissing,true)
  const publicVersion=await f.bindArticle(f.first),storyVersion=await f.bindStory([publicVersion])
  const storyId=await f.scalar('select story_id from mip_private.reviewed_public_story_versions where public_version_id=$1',[storyVersion])
  for(const nextRole of ['anon','authenticated']){
    role=nextRole
    const page=await loadArticles({supabaseClient:client}),detail=await loadArticleDetail(f.first.article_id,{supabaseClient:client})
    assert.equal(page.articles[0].public_version_id,publicVersion)
    assert.equal(page.articles[0].title,f.article.title)
    assert.equal(detail.public_version.capture_id,f.first.capture_id)
    assert.equal(detail.public_version.capture_hash,f.first.capture_hash)
    assert.equal(await f.scalar('select admission from public.news_reviewed_articles_public where id=$1',[f.first.article_id]),'proposition')
    assert.equal(detail.claims[0].span_start,2)
    assert.deepEqual(detail.citations,[])
    assert.deepEqual(detail.evidenceRecords,[])
    assert.equal(detail.published_at,'2026-10-01T10:00:00.123456+00:00')
    assert.equal((await versions.loadStoryVersion(storyId)).version.public_version_id,storyVersion)
    assert.equal((await versions.loadStoryForArticle(f.first.article_id)).version.story_id,storyId)
    const directory=await versions.loadStoryDirectory()
    assert.equal(directory.status,'available')
    assert.equal(directory.stories[0].story_id,storyId)
    assert.equal(directory.has_more,false)
    assert.equal((await loadArticles({q:'source reports',supabaseClient:client})).articles[0].id,f.first.article_id)
    assert.equal((await loadArticles({q:'PRIVATE_BODY_ONLY_TOKEN',supabaseClient:client})).total,0)
  }
  await f.ingest({...f.article,title:'PRIVATE_CORRECTION'},'synthetic-private-correction')
  const detail=await loadArticleDetail(f.first.article_id,{supabaseClient:client})
  assert.equal(detail.title,f.article.title)
  assert.equal(detail.public_version.pending_revision,true)
  await f.db.query("update public.articles set source_status='withdrawn' where id=$1",[f.first.article_id])
  assert.equal((await versions.loadStoryVersion(storyId)).status,'unavailable')
  assert.equal((await loadArticles({supabaseClient:client})).total,0)
  assert.ok(requests.some(r=>r.authorization==='Bearer synthetic-authenticated'))
  assert.ok(requests.every(r=>!['articles','news_detail_public','citations'].includes(r.name)))
})

test('typed envelope rejects malformed TZ/calendar/submillisecond order and unauthorized nested capture',async t=>{
  const f=await createReviewedVersionFixture()
  t.after(()=>f.db.close())
  await f.bindArticle(f.first)
  const row=await f.readArticle(f.first.article_id)
  const normalized=normalizeReviewedPublicVersion(row)
  assert.ok(Object.isFrozen(normalized.evidence[0]))
  for(const value of ['2026-02-30T10:00:00Z','2026-10-01T10:00:00','2026-10-01T10:00:00+25:00']){
    assert.equal(normalizeReviewedPublicVersion({...row,reviewed_at:value}),null)
  }
  assert.equal(normalizeReviewedPublicVersion({...row,captured_at:'2026-10-01T10:00:00.123456789Z',reviewed_at:'2026-10-01T10:00:00.123456788Z',visible_at:'2026-10-01T10:00:00.123456789Z'}),null)
  assert.equal(normalizeReviewedPublicVersion({...row,evidence:[{...row.evidence[0],capture_id:f.second.capture_id}]}),null)
  assert.equal(normalizeReviewedPublicVersion({...row,admission_kind:'source_report'}),null)
  assert.equal(normalizeReviewedPublicVersion({...row,sequence:1}),null)
})
