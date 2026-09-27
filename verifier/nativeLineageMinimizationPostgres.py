# UNAPPROVED — SOURCE CANDIDATE ONLY — NOT AUTHORIZED FOR EXECUTION OR TRANSMISSION
# Authored; NOT RUN. Fresh synthetic fixture; historical harness is not imported.
import hashlib, json, os, pathlib, subprocess, unittest, uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
CONTEXT=os.environ.get('MIP_NATIVE_LINEAGE_DISPOSABLE_CONTEXT')
if os.environ.get('MIP_NATIVE_LINEAGE_QUALIFICATION')!='separately-approved-disposable-only' or CONTEXT not in {'approved-existing-private-remote','approved-dedicated-ci'}:
    raise SystemExit('separate approval and an existing isolated disposable context required')
ENV={k:v for k,v in os.environ.items() if not k.startswith('PG')}
ENV.update(PGPASSWORD='mip-efta-disposable-ci-only',PGCONNECT_TIMEOUT='5',PGOPTIONS='-c statement_timeout=20000 -c lock_timeout=12000')
PSQL=['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','5432','-U','postgres']
MANIFEST=json.loads((ROOT/'verifier/native-lineage-minimization-source-candidate.json').read_text())
RUNTIME='synthetic-native-lineage';SOURCE='synthetic-native-lineage';IMPL='synthetic-native-lineage-v2'
SENTINEL='UNSELECTED_NATIVE_PAYLOAD_SENTINEL_72da3860'
TEXT='Officials reportedly approved the council funding proposal on Tuesday.'
ROLES={'worker':'mip_comparison_worker_v1','producer':'mip_comparison_producer_v1','publisher':'mip_projection_publisher_v1'}
def uid():return str(uuid.uuid4())
def q(v):return 'null' if v is None else "'"+str(v).replace("'","''")+"'"
def js(v):return q(json.dumps(v,separators=(',',':')))+'::jsonb'
def run(db,sql):
    p=subprocess.run(PSQL+['-d',db],input=sql,text=True,capture_output=True,env=ENV,timeout=90)
    if p.returncode:raise RuntimeError(p.stderr.strip())
    return p.stdout.strip()
def load(db,path):
    source=(ROOT/path).read_bytes()
    transforms=[t for t in MANIFEST['fixture_sql_transforms'] if t['path']==path]
    if transforms:
        if len(transforms)!=1:raise RuntimeError('ambiguous synthetic fixture transform')
        transform=transforms[0]
        if transform['id']!='empty-efta-scope-v1':raise RuntimeError('unapproved fixture transform')
        if hashlib.sha256(source).hexdigest()!=transform['source_sha256']:raise RuntimeError('fixture source digest mismatch')
        blob=hashlib.sha1(b'blob '+str(len(source)).encode()+b'\0'+source).hexdigest()
        if blob!=transform['source_git_blob']:raise RuntimeError('fixture source blob mismatch')
        prefix=transform['boundary_prefix'].encode();suffix=transform['boundary_suffix'].encode()
        if source.count(prefix)!=1 or source.count(suffix)!=1 or source.count(b'$scope$')!=2:raise RuntimeError('fixture scope boundary mismatch')
        start=source.index(prefix)+len(prefix);end=source.index(suffix,start)
        if start>=end or transform['replacement']!='[]':raise RuntimeError('fixture scope omission mismatch')
        source=source[:start]+b'[]'+source[end:]
        if hashlib.sha256(source).hexdigest()!=transform['installed_sql_sha256']:raise RuntimeError('transformed fixture digest mismatch')
    run(db,source.decode('utf-8'))
    if transforms and run(db,'select count(*) from mip_identity.efta_scope')!='0':raise RuntimeError('historical EFTA material seeded')

def build_extra_schema():
    generic=["claims","article_claims","claim_evidence_links","claim_corrections","story_arcs","nodes","edges","arc_events","arc_milestones","arc_membership_candidates"]
    sql="""create schema auth;
create table auth.sessions(id uuid primary key,user_id uuid not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp());
alter table public.articles add column reader_state text not null default 'pending_review';
alter table public.articles add column source_status text not null default 'active';
alter table public.articles enable row level security; alter table public.articles force row level security;
"""
    for name in generic:
        sql+=f"create table public.{name}(id uuid primary key default gen_random_uuid(),payload jsonb not null default '{{}}'::jsonb);\n"
    sql+="""drop table if exists public.explanations;
create table public.explanations(
 id uuid primary key default gen_random_uuid(),assertion_id text not null,assertion_type text not null,
 version integer not null,is_current boolean not null default true,source_ids uuid[] not null default '{}',
 archived_sources jsonb not null default '[]',source_roles jsonb not null default '{}',supporting_passage text,
 contradicting_evidence jsonb not null default '[]',missing_evidence jsonb not null default '[]',
 shared_entities uuid[] not null default '{}',relationship_type text,rule_version text,provenance_class text not null,
 created_at timestamptz not null default now(),recomputed_at timestamptz,reviewed_at timestamptz,
 review_status text not null default 'draft',falsification_condition text,correction_history jsonb not null default '[]',
 remaining_uncertainty text,state text not null default 'explanation_pending');
create schema evidence_pipeline;
create table evidence_pipeline.article_captures(
 id uuid primary key,article_id uuid not null references public.articles,id_unused text,content_hash text not null,
 payload jsonb not null,captured_at timestamptz not null default clock_timestamp(),review_state text not null default 'pending');
create table evidence_pipeline.evidence_candidates(
 id uuid primary key,capture_id uuid not null references evidence_pipeline.article_captures,
 candidate_kind text not null default 'claim',extractor_version text not null default 'synthetic-v2',source_field text,span_start int,span_end int,excerpt text,review_state text default 'pending',
 predecessor_candidate_id uuid,event_node_id uuid,related_node_id uuid,place_id uuid,spatial_revision_id uuid);
alter table evidence_pipeline.article_captures enable row level security;
alter table evidence_pipeline.article_captures force row level security;
alter table evidence_pipeline.evidence_candidates enable row level security;
alter table evidence_pipeline.evidence_candidates force row level security;
"""
    return sql

class NativeLineagePG(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not run('postgres','show server_version').startswith('17.6'):raise RuntimeError('expected disposable PostgreSQL17.6')
        if json.loads(run('postgres',"select coalesce(jsonb_agg(datname order by datname),'[]') from pg_database where not datistemplate and datname<>'postgres'")):raise RuntimeError('pristine disposable database cluster required')
        cls.role_query="select coalesce(jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'super',rolsuper,'bypass',rolbypassrls,'createrole',rolcreaterole,'createdb',rolcreatedb,'inherit',rolinherit,'replication',rolreplication) order by rolname),'[]') from pg_roles"
        cls.membership_query="select coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'member',m.rolname,'admin',a.admin_option,'inherit',a.inherit_option,'set',a.set_option) order by r.rolname,m.rolname),'[]') from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member"
        cls.baseline_roles=json.loads(run('postgres',cls.role_query));cls.baseline_memberships=json.loads(run('postgres',cls.membership_query))
        cls.baseline_names={r['name'] for r in cls.baseline_roles}
        if any(n.startswith(('mip_','qual_')) for n in cls.baseline_names):raise RuntimeError('pristine approved disposable cluster required: reserved fixture roles already exist')
    @classmethod
    def tearDownClass(cls):
        current=json.loads(run('postgres',cls.role_query));created={r['name'] for r in current}-cls.baseline_names
        if created-set(MANIFEST['fixture_role_allowlist']):raise AssertionError('unexpected role creation; refusing unlisted cleanup')
        for role in sorted(created,reverse=True):run('postgres','drop role "'+role.replace('"','""')+'"')
        if json.loads(run('postgres',cls.role_query))!=cls.baseline_roles:raise AssertionError('role baseline changed')
        if json.loads(run('postgres',cls.membership_query))!=cls.baseline_memberships:raise AssertionError('membership baseline changed')
    def setUp(self):
        self.db='mip_native_'+uuid.uuid4().hex
        run('postgres','create database '+self.db);self.addCleanup(lambda:run('postgres','drop database if exists '+self.db))
        self.admin("do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;end $$;")
        for p in MANIFEST['kernel_install_order']:load(self.db,p)
        self.admin(build_extra_schema())
        for p in MANIFEST['authority_install_order']:
            load(self.db,p)
            if p.endswith('/006_collector_reconciliation.sql'):
                self.admin("create policy native_test_source_read on public.articles for select to mip_kernel_owner_v2,mip_collector_owner_v2 using(id in ('00000000-0000-4000-8000-000000000002'::uuid,'00000000-0000-4000-8000-000000000003'::uuid));")
                self.admin("insert into mip_identity.collector_config values(true,"+q(SOURCE)+");select mip_identity.capture_backlog();")
            if p.endswith('/007_survivor_release.sql'):
                self.admin("create policy native_test_publication_source_read on public.articles for select to mip_publication_owner_v2 using(id in ('00000000-0000-4000-8000-000000000002'::uuid,'00000000-0000-4000-8000-000000000003'::uuid));")
                self.admin('select mip_identity.install_survivor_fences();')
        self.assertEqual(self.admin('select count(*) from mip_identity.efta_scope'),'0')
        self.seed()
    def admin(self,sql):return run(self.db,sql)
    def role(self,role,sql):return self.admin('set role '+role+';'+sql)
    def value(self,sql):return json.loads(self.admin(sql))
    def seed(self):
        self.admin('update public.articles set title='+q(TEXT)+',summary='+q(TEXT)+",body_text=null,reader_state='eligible',source_status='active';")
        self.admin("insert into evidence_pipeline.article_captures(id,article_id,content_hash,payload) select a.id,a.id,comparison_qualification.argument_digest(p.v),p.v from public.articles a cross join lateral(select jsonb_build_object('title',a.title,'summary',a.summary,'url','https://synthetic.invalid/source','outlet',a.outlet,'published_at',null,'body_text',"+q(SENTINEL)+",'unselected_debug',"+q(SENTINEL)+") v)p;")
        self.admin("insert into evidence_pipeline.evidence_candidates(id,capture_id,source_field,span_start,span_end,excerpt) select id,id,'summary',0,length("+q(TEXT)+'),'+q(TEXT)+' from evidence_pipeline.article_captures;')
        self.sessions={};key=uid()
        self.admin('insert into mip_identity.key_versions values('+q(key)+",'https://synthetic.invalid','synthetic','{}','2020-01-01','2999-01-01','synthetic-only');insert into mip_identity.key_heads values('https://synthetic.invalid','synthetic',"+q(key)+',true);')
        for kind,role in ROLES.items():
            mapping=uid();session=uid();self.sessions[kind]=session
            self.admin('insert into mip_identity.mapping_versions values('+','.join(map(q,[mapping,RUNTIME,role,'https://synthetic.invalid','synthetic','synthetic-subject',key]))+",600,'synthetic-only');insert into mip_identity.mapping_heads values("+','.join(map(q,[RUNTIME,role,mapping]))+',true);'+
                'insert into comparison_qualification.principal_sessions(session_id,principal,runtime_id,expires_at) values('+','.join(map(q,[session,role,RUNTIME]))+",'2999-01-01');insert into mip_identity.sessions values("+','.join(map(q,[session,uid(),uuid.uuid4().hex+uuid.uuid4().hex,mapping,key]))+",'2999-01-01','synthetic-only');")
        self.admin('insert into comparison_qualification.runtime_source_scope(runtime_id,source) values('+q(RUNTIME)+','+q(SOURCE)+');insert into comparison_qualification.evaluated_implementations(runtime_id,implementation) values('+q(RUNTIME)+','+q(IMPL)+');insert into mip_cutover_authority.runtime_config values('+q(RUNTIME)+','+q(SOURCE)+','+q(IMPL)+",'{\"entries\":[]}');")
        for kind,ops in {'worker':['worker_claim','worker_complete','worker_fail','worker_journal_put','worker_journal_get'],'producer':['producer_enqueue']}.items():
            for op in ops:self.admin('insert into comparison_qualification.runtime_bindings(runtime_id,principal,rpc_name) values('+','.join(map(q,[RUNTIME,ROLES[kind],op]))+');')
        self.original_claims=self.admin('select jsonb_agg(claims order by id)::text from public.articles')
    def enqueue_claim(self):
        self.generation=self.role(ROLES['producer'],'select mip_identity.capture_delta('+q(uid())+','+q(self.sessions['producer'])+','+q(RUNTIME)+');')
        self.claim=json.loads(self.role(ROLES['worker'],'select mip_identity.worker_claim('+q(uid())+','+q(self.sessions['worker'])+','+q(RUNTIME)+');'))
        p=subprocess.run(['node',str(ROOT/'verifier/nativeLineageWorkerFixture.mjs')],input=json.dumps({'claim':self.claim,'session':self.sessions['worker'],'runtime':RUNTIME}),text=True,capture_output=True,env=ENV,timeout=30)
        if p.returncode:raise AssertionError('synthetic worker bridge failed')
        self.completion=json.loads(p.stdout);return self.completion
    def journal(self,args):
        entry={'version':1,'operation':'worker_complete','args':{k:v for k,v in args.items() if k!='p_session'}}
        return self.role(ROLES['worker'],'select mip_identity.worker_journal_put('+q(self.sessions['worker'])+','+q(RUNTIME)+','+q('worker_complete:'+args['p_request'])+','+js(entry)+');')
    def complete(self,args):
        order=['p_request','p_session','p_runtime','p_generation','p_token','p_input_hash','p_implementation']
        return self.role(ROLES['worker'],'select mip_identity.worker_complete('+','.join(q(args[k]) for k in order)+','+js(args['p_output'])+');')
    def reviewed(self):
        args=self.enqueue_claim();self.assertEqual(self.journal(args),'t');self.assertEqual(self.journal(args),'t')
        entry=json.loads(self.role(ROLES['worker'],'select mip_identity.worker_journal_get('+q(self.sessions['worker'])+','+q(RUNTIME)+','+q('worker_complete:'+args['p_request'])+');'))
        replay=dict(entry['args'],p_session=self.sessions['worker'])
        self.assertEqual(replay,args)
        self.assertEqual(self.complete(replay),'completed');self.assertEqual(self.complete(args),'completed')
        self.assertEqual(self.admin('select count(*) from comparison_qualification.outputs where generation_id='+q(self.generation)),'1')
        self.output=args['p_output'];self.input=json.loads(self.claim['input_text']);evidence=[]
        for surface in self.output['projection']['article_claims']:
            cap=next(m['retained_capture'] for e in self.input['eventInputs'] for m in e['members'] if m['article']['id']==surface['article_id'])
            k=next(k for k in cap['candidates'] if k['excerpt']==surface['surface_text'])
            evidence.append(dict(article_id=surface['article_id'],claim_key=surface['claim_key'],candidate_id=k['candidate_id'],capture_id=cap['capture_id'],content_hash=cap['content_hash'],field=k['source_field'],span_start=k['span_start'],span_end=k['span_end'],excerpt=k['excerpt'],field_hash=k['field_hash'],auditability_state='verified_retained_source'))
        for x in self.output['projection']['explanations']:
            x=dict(x,id=uid(),version=1,is_current=True,source_ids=sorted(set(e['article_id'] for e in evidence)),archived_sources=[dict(article_id=e['article_id'],field_hash=e['field_hash'],status='retained') for e in evidence],provenance_class='synthetic_mechanism',state='ok',review_status='draft',falsification_condition='An independent record disproves the council decision.')
            cols=['id','assertion_id','assertion_type','version','is_current','source_ids','archived_sources','supporting_passage','rule_version','provenance_class','state','review_status','falsification_condition']
            self.admin('insert into public.explanations('+','.join(cols)+') select '+','.join('x.'+c for c in cols)+' from jsonb_populate_record(null::public.explanations,'+js(x)+') x;select mip_factual.review_publish('+q(x['id'])+",'synthetic-only');")
        self.review=uid();policy=uid();explanations=self.value('select jsonb_agg(to_jsonb(e) order by assertion_id) from public.explanations e')
        self.admin('insert into mip_identity.publication_policy_versions values('+q(policy)+",'synthetic-privacy','synthetic-rights','synthetic-publication','survivor-reader-v1','synthetic-only');insert into mip_identity.publication_policy_heads values(true,"+q(policy)+',true);')
        self.admin('insert into mip_identity.publication_reviews select '+q(self.review)+'::uuid,g.id,g.input_hash,o.output_hash,'+q(policy)+"::uuid,'eligible','eligible',"+js(evidence)+','+js(explanations)+",mip_identity.survivor_context(),'2999-01-01','synthetic-only','synthetic-only' from comparison_qualification.generations g join comparison_qualification.outputs o on o.generation_id=g.id where g.id="+q(self.generation)+';insert into mip_identity.publication_review_heads values('+q(self.generation)+','+q(self.review)+',true);')
        for event in self.input['eventInputs']:
            for member in event['members']:
                article=member['article'];version=self.admin('select comparison_qualification.argument_digest('+js(article)+');')
                for op in ['retention','analysis','excerpt_display']:
                    for domain in ['rights','privacy']:
                        scope=dict(source_project=SOURCE,material_ref='article:'+article['id'],material_version=version,operation=op,audience='isolated_internal_review',domain=domain);rev=uid()
                        self.admin('insert into mip_identity.operation_evidence_versions values('+q(rev)+','+js(scope)+",'synthetic-fixture-v1','synthetic-record','v1',repeat('a',64),'synthetic-evidence','synthetic-owner','synthetic-approval','recorded','allow','2020-01-01','2999-01-01','[]',true);insert into mip_identity.operation_evidence_heads values("+js(scope)+','+q(rev)+',true);')
        return args
    def release(self):
        self.release_request=uid()
        self.assertEqual(self.role(ROLES['publisher'],'select mip_identity.release_isolated('+q(self.release_request)+','+q(self.sessions['publisher'])+','+q(RUNTIME)+','+q(self.review)+');'),'isolated_released')
        return self.read()
    def read(self):
        return json.loads(self.role(ROLES['publisher'],'select mip_identity.read_isolated_comparison('+q(self.sessions['publisher'])+','+q(RUNTIME)+','+q(self.release_request)+');'))

    def test_full_journal_review_reader_binding_and_pending_public_isolation(self):
        args=self.reviewed();result=self.release();self.assertEqual(self.read(),result)
        self.assertEqual(result['contract_version'],'accepted-comparison-private-v2');self.assertEqual(result['generation_id'],self.generation)
        self.assertEqual(result['audience'],'isolated_internal_review');self.assertTrue(result['events']);self.assertTrue(all(e['evidence'] for e in result['events']))
        for event in result['events']:
            self.assertEqual(event['occurrence']['state'],'unverified')
            for citation in event['evidence']:
                self.assertEqual(citation['excerpt'],TEXT);self.assertEqual(citation['candidate_review_state'],'pending')
                self.assertIn(citation['candidate_id'],[m['retained_capture']['candidates'][0]['candidate_id'] for e in self.input['eventInputs'] for m in e['members']])
        for relation,column in [('comparison_qualification.generations','input_payload'),('comparison_qualification.outputs','output_payload'),('mip_cutover_authority.worker_journal','entry'),('mip_cutover_authority.approved_payloads','payload'),('mip_identity.publication_reviews','evidence')]:
            self.assertEqual(self.admin('select count(*) from '+relation+' where position('+q(SENTINEL)+' in '+column+'::text)>0'),'0')
        self.assertNotIn(SENTINEL,json.dumps(result))
        self.assertEqual(self.admin("select count(*) from evidence_pipeline.article_captures where payload->>'unselected_debug'="+q(SENTINEL)),'2')
        self.assertEqual(self.admin("select count(*) from evidence_pipeline.evidence_candidates where review_state<>'pending'"),'0')
        self.assertEqual(self.admin('select jsonb_agg(claims order by id)::text from public.articles'),self.original_claims)
        self.assertEqual(self.admin('select count(*) from public.claims'),'0');self.assertEqual(self.admin('select count(*) from comparison_qualification.publication_history'),'0')
        with self.assertRaisesRegex(RuntimeError,'mip_public_release_disabled'):self.admin('select mip_identity.release_public()')
        entry=self.value('select entry from mip_cutover_authority.worker_journal where journal_key='+q('worker_complete:'+args['p_request']))
        self.assertNotIn('p_token',entry['args']);self.assertNotIn('p_session',entry['args'])
        self.assertEqual(self.admin('select count(*) from mip_cutover_authority.worker_journal where journal_key='+q('worker_complete:'+args['p_request'])),'1')
    def test_unknown_nested_lineage_is_denied_at_both_durable_boundaries(self):
        args=self.enqueue_claim()
        for suffix in ['capture','metadata','candidate','scalar']:
            bad=json.loads(json.dumps(args));bad['p_request']=uid();cap=bad['p_output']['retained_lineage'][0]['retained_capture']
            if suffix=='scalar':cap['source_metadata']['url']={'unselected_extra':SENTINEL}
            else:
                target=cap if suffix=='capture' else cap['source_metadata'] if suffix=='metadata' else cap['candidates'][0];target['unselected_extra']=SENTINEL
            with self.assertRaises(RuntimeError):self.journal(bad)
            with self.assertRaises(RuntimeError):self.complete(bad)
        self.assertEqual(self.admin('select count(*) from mip_cutover_authority.worker_journal'),'0');self.assertEqual(self.admin('select count(*) from comparison_qualification.outputs'),'0')
        self.assertEqual(self.complete(args),'completed');conflict=json.loads(json.dumps(args));conflict['p_output']['source_observed_at']='2020-01-01'
        with self.assertRaises(RuntimeError):self.complete(conflict)
        self.assertEqual(self.admin('select count(*) from comparison_qualification.outputs'),'1')
    def test_review_first_retention_rejects_extra_fields_and_omits_unused_columns(self):
        self.reviewed()
        original=self.value('select to_jsonb(r) from mip_identity.publication_reviews r where revision='+q(self.review))
        retained={'assertion_id','assertion_type','version','is_current','source_ids','archived_sources','supporting_passage','rule_version','provenance_class','review_status','state','falsification_condition'}
        for explanation in original['explanations']:self.assertEqual(set(explanation),retained)
        for target in ['evidence','explanation','archive','scalar']:
            row=json.loads(json.dumps(original));row['revision']=uid()
            if target=='evidence':row['evidence'][0]['native_payload']=SENTINEL
            elif target=='explanation':row['explanations'][0]['native_payload']=SENTINEL
            elif target=='archive':row['explanations'][0]['archived_sources'][0]['native_payload']=SENTINEL
            else:row['explanations'][0]['supporting_passage']={'native_payload':SENTINEL}
            with self.assertRaisesRegex(RuntimeError,'mip_native_review_retention_shape'):
                self.admin('insert into mip_identity.publication_reviews select * from jsonb_populate_record(null::mip_identity.publication_reviews,'+js(row)+')')
            self.assertEqual(self.admin('select count(*) from mip_identity.publication_reviews where revision='+q(row['revision'])),'0')
        row=json.loads(json.dumps(original));row['revision']=uid()
        row['explanations'][0]['source_roles']={'unused_native_payload':SENTINEL}
        self.admin('insert into mip_identity.publication_reviews select * from jsonb_populate_record(null::mip_identity.publication_reviews,'+js(row)+')')
        saved=self.value('select explanations from mip_identity.publication_reviews where revision='+q(row['revision']))
        self.assertNotIn(SENTINEL,json.dumps(saved));self.assertEqual(set(saved[0]),retained)
        self.release()
        self.assertNotIn(SENTINEL,self.admin('select payload::text from mip_cutover_authority.approved_payloads'))
    def test_authorized_reader_refuses_inaccessible_bound_evidence(self):
        self.reviewed();self.release();before=self.read()
        sql="begin;alter policy mip_native_review_kernel_select on evidence_pipeline.article_captures using(false);set role "+ROLES['publisher']+';select mip_identity.read_isolated_comparison('+q(self.sessions['publisher'])+','+q(RUNTIME)+','+q(self.release_request)+');rollback;'
        with self.assertRaises(RuntimeError):self.admin(sql)
        # ON_ERROR_STOP disconnect rolls back the policy mutation, including on refusal.
        self.assertEqual(self.read(),before)
        self.assertEqual(self.admin("select pg_get_expr(polqual,polrelid) from pg_policy where polname='mip_native_review_kernel_select' and polrelid='evidence_pipeline.article_captures'::regclass"),'true')

    def test_native_delta_full_digest_sql_nulls_noop_transaction_and_generation(self):
        cap=self.value('select to_jsonb(c) from evidence_pipeline.article_captures c order by id limit 1');cid=cap['id']
        before=self.admin('select comparison_qualification.argument_digest(to_jsonb(c)) from evidence_pipeline.article_captures c where id='+q(cid));count=int(self.admin('select count(*) from mip_identity.source_changes'))
        self.admin('begin;update evidence_pipeline.article_captures set id_unused='+q(SENTINEL+'-changed')+' where id='+q(cid)+';update evidence_pipeline.article_captures set id_unused=id_unused where id='+q(cid)+';commit;')
        self.assertEqual(int(self.admin('select count(*) from mip_identity.source_changes')),count+1)
        row=self.value("select to_jsonb(c) from mip_identity.source_changes c where relation_name='evidence_pipeline.article_captures' and row_key="+q(cid)+' order by retained_at desc,id desc limit 1')
        after=self.admin('select comparison_qualification.argument_digest(to_jsonb(c)) from evidence_pipeline.article_captures c where id='+q(cid))
        self.assertEqual(row['native_retention_version'],1);self.assertEqual(row['operation'],'UPDATE');self.assertIsNone(row['before_row']);self.assertIsNone(row['after_row'])
        self.assertEqual(row['before_hash'],before);self.assertEqual(row['after_hash'],after);self.assertNotEqual(before,after)
        self.assertEqual(row['before_identity'],{'id':cid,'article_id':cap['article_id']});self.assertEqual(row['before_identity'],row['after_identity']);self.assertNotIn(SENTINEL,json.dumps(row))
        self.enqueue_claim();self.assertEqual(self.admin('select generation_id::text from mip_identity.generation_changes where change_id='+q(row['id'])),self.generation)
        reported=json.loads(self.role(ROLES['producer'],'select mip_identity.reconciliation('+q(self.sessions['producer'])+','+q(RUNTIME)+');'))
        r=next(r for r in reported if r['change_id']==row['id']);self.assertEqual(r['before_hash'],before);self.assertEqual(r['after_hash'],after);self.assertEqual(r['generation_id'],self.generation)
        legacy=self.value("select jsonb_build_object('id',id,'before',case when before_row is null then null else comparison_qualification.argument_digest(before_row) end,'after',case when after_row is null then null else comparison_qualification.argument_digest(after_row) end) from mip_identity.source_changes where relation_name='public.articles' and native_retention_version is null order by retained_at,id limit 1")
        lr=next(r for r in reported if r['change_id']==legacy['id']);self.assertEqual(lr['before_hash'],legacy['before']);self.assertEqual(lr['after_hash'],legacy['after'])
        candidate=uid();self.admin('begin;insert into evidence_pipeline.evidence_candidates(id,capture_id,source_field,span_start,span_end,excerpt) values('+q(candidate)+','+q(cid)+",'summary',0,"+str(len(TEXT))+','+q(TEXT)+');delete from evidence_pipeline.evidence_candidates where id='+q(candidate)+';commit;')
        changes=self.value("select jsonb_agg(to_jsonb(c) order by retained_at,id) from mip_identity.source_changes c where relation_name='evidence_pipeline.evidence_candidates' and row_key="+q(candidate))
        self.assertEqual([r['operation'] for r in changes],['INSERT','DELETE']);self.assertEqual(changes[0]['transaction_id'],changes[1]['transaction_id'])
        self.assertIsNone(changes[0]['before_hash']);self.assertIsNone(changes[0]['before_identity']);self.assertIsNone(changes[1]['after_hash']);self.assertIsNone(changes[1]['after_identity']);self.assertEqual(changes[0]['after_hash'],changes[1]['before_hash'])
        self.assertNotEqual(self.admin("select count(*) from mip_identity.source_changes where relation_name='public.articles' and after_row is not null and native_retention_version is null"),'0')
    def test_excluded_native_change_invalidates_accepted_read(self):
        self.reviewed();self.release();self.admin('update evidence_pipeline.article_captures set id_unused='+q(SENTINEL+'-outside-lineage')+' where id=(select min(id::text)::uuid from evidence_pipeline.article_captures)')
        with self.assertRaises(RuntimeError):self.read()
        self.assertEqual(self.admin('select count(*) from mip_cutover_authority.approved_payloads'),'1');self.assertEqual(self.admin('select count(*) from public.claims'),'0')
    def test_stale_missing_and_field_hash_evidence_cannot_release(self):
        self.reviewed();self.release()
        for sql in ["update evidence_pipeline.article_captures set content_hash=repeat('0',64)",'delete from evidence_pipeline.evidence_candidates']:
            before=self.admin('select count(*) from mip_identity.private_releases')
            with self.assertRaises(RuntimeError):self.admin('begin;'+sql+';set role '+ROLES['publisher']+';select mip_identity.read_isolated_comparison('+q(self.sessions['publisher'])+','+q(RUNTIME)+','+q(self.release_request)+');commit;')
            self.assertEqual(self.admin('select count(*) from mip_identity.private_releases'),before)
        evidence=self.value('select evidence from mip_identity.publication_reviews where revision='+q(self.review));evidence[0]['field_hash']='0'*64
        with self.assertRaises(RuntimeError):self.admin('select comparison_qualification.check_native_review_lineage('+js(self.input)+','+js(self.output)+','+js(evidence)+')')
    def test_final_install_owners_role_paths_acl_rls_and_direct_wrapper_denials(self):
        load(self.db,'supabase/qualification/mip-cutover-authority/019_native_retention_permissions.sql')
        for relation in ['evidence_pipeline.article_captures','evidence_pipeline.evidence_candidates']:
            self.assertEqual(self.admin("select count(*) from pg_trigger where tgrelid="+q(relation)+"::regclass and not tgisinternal and tgenabled='O' and tgtype=29 and tgfoid='mip_identity.collector_native_change()'::regprocedure"),'1')
            self.assertEqual(self.admin("select count(*) from pg_trigger where tgrelid="+q(relation)+"::regclass and not tgisinternal and tgenabled='O' and tgtype=29 and tgfoid='mip_identity.collector_change()'::regprocedure"),'0')
        self.assertEqual(self.admin("select count(*) from pg_class where oid in ('mip_identity.source_changes'::regclass,'mip_cutover_authority.worker_journal'::regclass) and relrowsecurity and relforcerowsecurity"),'2')
        calls=["select comparison_qualification.native_capture_lineage('00000000-0000-4000-8000-000000000002')","select comparison_qualification.check_native_lineage_output('{}','{}')","select comparison_qualification.check_native_review_lineage('{}','{}','[]')","select mip_cutover_authority.worker_complete(gen_random_uuid(),gen_random_uuid(),'synthetic',gen_random_uuid(),gen_random_uuid(),'hash','impl','{}')"]
        for role in ['anon','authenticated','service_role',ROLES['worker'],ROLES['producer']]:
            for call in calls:
                with self.assertRaisesRegex(RuntimeError,'permission denied'):self.role(role,call)
            with self.assertRaisesRegex(RuntimeError,'permission denied'):self.role(role,'select * from evidence_pipeline.article_captures')
        for role in ['anon','authenticated','service_role',ROLES['producer']]:
            with self.assertRaisesRegex(RuntimeError,'permission denied'):self.role(role,"select mip_identity.worker_claim(gen_random_uuid(),gen_random_uuid(),'synthetic')")
        with self.assertRaises(RuntimeError):self.role(ROLES['worker'],"select mip_identity.worker_claim(gen_random_uuid(),gen_random_uuid(),'synthetic')")
    def test_final_retention_catalog_rejects_rollback_mutations(self):
        # Authored; NOT RUN. Requires separately approved disposable qualification.
        source=(ROOT/'supabase/qualification/mip-cutover-authority/019_native_retention_permissions.sql').read_text()
        opening='do $final_retention_chain_permissions$';closing='end $final_retention_chain_permissions$;'
        self.assertEqual(source.count(opening),1);self.assertEqual(source.count(closing),1)
        check=source[source.index(opening):source.index(closing)+len(closing)];self.admin(check)
        complete='mip_identity.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb)'
        mutations=[
          ('function owner','alter function '+complete+' owner to mip_cutover_schema_owner_v1'),
          ('definer flag','alter function '+complete+' security invoker'),
          ('search path','alter function '+complete+' set search_path=public'),
          ('extra configuration','alter function '+complete+' set statement_timeout=1000'),
          ('extra execute','grant execute on function '+complete+' to service_role'),
          ('grant option','grant execute on function '+complete+' to mip_comparison_worker_v1 with grant option'),
          ('missing execute','revoke execute on function '+complete+' from mip_comparison_worker_v1'),
          ('owner membership','grant mip_comparison_worker_owner_v1 to mip_comparison_worker_v1'),
          ('inherit attribute','alter role mip_comparison_worker_v1 noinherit'),
          ('journal policy','alter policy journal_rpc_owner on mip_cutover_authority.worker_journal using(false)'),
          ('journal column grant','grant select(entry) on mip_cutover_authority.worker_journal to service_role'),
          ('review guard disabled','alter table mip_identity.publication_reviews disable trigger publication_review_retention'),
          ('review guard removed','drop trigger publication_review_retention on mip_identity.publication_reviews'),
          ('review guard filtered','drop trigger publication_review_retention on mip_identity.publication_reviews;create trigger publication_review_retention before insert on mip_identity.publication_reviews for each row when(false) execute function mip_identity.guard_publication_review_retention()')]
        sinks=['comparison_qualification.generations','comparison_qualification.outputs','comparison_qualification.jobs','comparison_qualification.failure_reports','comparison_qualification.request_runs','mip_cutover_authority.lease_owners','mip_cutover_authority.worker_journal','mip_identity.publication_reviews','mip_identity.review_stages','mip_identity.private_releases','mip_cutover_authority.approved_payloads','mip_cutover_authority.publication_selections']
        for sink in sinks:
            mutations.extend([(sink+' owner','alter table '+sink+' owner to mip_kernel_owner_v2'),(sink+' RLS','alter table '+sink+' disable row level security'),(sink+' FORCE','alter table '+sink+' no force row level security'),(sink+' ACL','grant select on '+sink+' to service_role')])
        for label,mutation in mutations:
            with self.subTest(mutation=label):
                with self.assertRaisesRegex(RuntimeError,'mip_native_final_chain_'):self.admin('begin;\n'+mutation+';\n'+check+'\nrollback;')
                self.admin(check)

    def test_fresh_and_reused_native_trigger_installation_has_no_duplicates(self):
        text=(ROOT/'supabase/qualification/mip-cutover-authority/017_native_capture_review.sql').read_text();start=text.index('do $fences$');end=text.index('$fences$;',start)+len('$fences$;');fences=text[start:end]
        for reused in [False,True]:
            for relation in ['evidence_pipeline.article_captures','evidence_pipeline.evidence_candidates']:
                triggers=self.value("select coalesce(jsonb_agg(tgname),'[]') from pg_trigger where tgrelid="+q(relation)+"::regclass and not tgisinternal and tgfoid in ('mip_identity.collector_native_change()'::regprocedure,'mip_identity.collector_change()'::regprocedure,'mip_identity.collector_lock()'::regprocedure)")
                for name in triggers:self.admin('drop trigger "'+name.replace('"','""')+'" on '+relation)
                if reused:self.admin('create trigger synthetic_legacy_native_change after insert or update or delete on '+relation+" for each row execute function mip_identity.collector_change('id');create trigger synthetic_legacy_native_fence before insert or update or delete or truncate on "+relation+' for each statement execute function mip_identity.collector_lock();')
            self.admin(fences);self.admin(fences)
            for relation in ['evidence_pipeline.article_captures','evidence_pipeline.evidence_candidates']:
                self.assertEqual(self.admin("select count(*) from pg_trigger where tgrelid="+q(relation)+"::regclass and tgenabled='O' and tgtype=29 and tgfoid='mip_identity.collector_native_change()'::regprocedure"),'1')
                self.assertEqual(self.admin("select count(*) from pg_trigger where tgrelid="+q(relation)+"::regclass and tgenabled='O' and tgtype=62 and tgfoid='mip_identity.collector_lock()'::regprocedure"),'1')
            before=int(self.admin('select count(*) from mip_identity.source_changes'));self.admin('update evidence_pipeline.article_captures set id_unused='+q(uid())+' where id=(select min(id::text)::uuid from evidence_pipeline.article_captures)');self.assertEqual(int(self.admin('select count(*) from mip_identity.source_changes')),before+1)
    def test_repeatable_read_snapshot_does_not_mix_candidate_supersession(self):
        sql="select (comparison_qualification.source_snapshot('{\"entries\":[]}',"+q(IMPL)+")-'snapshot_metadata')::text;"
        proc=subprocess.Popen(PSQL+['-d',self.db],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=ENV)
        try:
            proc.stdin.write('begin isolation level repeatable read;'+sql+'\n\\echo NATIVE_READY\n');proc.stdin.flush()
            before=json.loads(proc.stdout.readline());self.assertEqual(proc.stdout.readline().strip(),'NATIVE_READY')
            old=before['eventInputs'][0]['members'][0]['retained_capture']['candidates'][0]['candidate_id'];new=uid()
            self.admin('insert into evidence_pipeline.evidence_candidates(id,capture_id,candidate_kind,extractor_version,source_field,span_start,span_end,excerpt,predecessor_candidate_id) select '+q(new)+"::uuid,capture_id,candidate_kind,extractor_version||':next',source_field,span_start,span_end,excerpt,id from evidence_pipeline.evidence_candidates where id="+q(old))
            proc.stdin.write(sql+'commit;\n');proc.stdin.flush();after=json.loads(proc.stdout.readline());self.assertEqual(before,after)
            current=self.value(sql);self.assertEqual([k['candidate_id'] for k in current['eventInputs'][0]['members'][0]['retained_capture']['candidates']],[new])
        finally:
            if proc.poll() is None:
                proc.stdin.write('rollback;\n\\q\n');proc.stdin.flush()
                try:proc.wait(timeout=5)
                except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=5)

if __name__=='__main__':unittest.main(verbosity=2)
