# Opt-in synthetic qualification. No network feed, policy download, or hosted target.
import hashlib, importlib.util, json, pathlib, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('native_fixture',ROOT/'verifier/nativeLineageMinimizationPostgres.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
q,js,uid=M.q,M.js,M.uid
A='mip_cutover_authority_admin_v1';U='mip_publication_owner_v2';Q='qik_ingest_runtime'
NEW='supabase/qualification/mip-cutover-authority/020_doj_private_permission.sql'
C3='supabase/qualification/qik-ingest/'
IDS=['00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003']
SOURCE_ID='1b4c6203-f6dc-4be7-a61e-5ee1c2e2866d'
FEED='https://www.justice.gov/news/rss?type=press_release&m=1'
TOKEN='synthetic-doj-disposable-token-0000000000000000'
def digest(s):return hashlib.sha256(s.encode()).hexdigest()
def replace_once(s,old,new=''):
    if s.count(old)!=1:raise AssertionError('synthetic schema composition boundary changed')
    return s.replace(old,new,1)
def omit_block(s,start,end):
    if s.count(start)!=1:raise AssertionError('synthetic schema block changed')
    a=s.index(start);b=s.index(end,a)+len(end)
    return s[:a]+s[b:]

class DOJ(M.NativeLineagePG):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if {'qik_ingest_fn_owner','qik_ingest_runtime'} & cls.baseline_names:
            raise RuntimeError('dedicated disposable cluster must not contain C3 roles')
        M.MANIFEST['fixture_role_allowlist']=list(M.MANIFEST['fixture_role_allowlist'])+['qik_ingest_fn_owner','qik_ingest_runtime']
    def drop_c3_roles(self):
        # Each actual C3 install creates fixed roles. Drop only these test-created
        # roles after its database is gone; RESTRICT is intentional.
        for role in ['qik_ingest_runtime','qik_ingest_fn_owner']:
            if M.run('postgres','select count(*) from pg_roles where rolname='+q(role))=='1':
                M.run('postgres','drop role '+role)
    def setUp(self):
        self.db='mip_doj_'+uid().replace('-','')
        M.run('postgres','create database '+self.db)
        self.addCleanup(self.drop_c3_roles)
        self.addCleanup(lambda:M.run('postgres','drop database if exists '+self.db))
        # Actual C3 disposable public schema, including nodes and spatial view.
        M.load(self.db,C3+'fixture_substrate.sql')
        self.admin("alter table public.articles add column embedding text,add column unattributed boolean,add column monoculture boolean,add column is_digest boolean;alter table public.articles alter column feed set default 'synthetic';alter table public.articles alter column url drop not null;alter table public.pipeline_config add column updated_at timestamptz;")
        for p in M.MANIFEST['kernel_install_order']:
            if p.endswith('/source-fixture.sql'):
                s=(ROOT/p).read_text()
                s=omit_block(s,'create table public.articles (','\n);')
                s=replace_once(s,'create table public.pipeline_config (key text primary key,value jsonb,updated_at timestamptz);')
                self.admin(s)
            else:M.load(self.db,p)
        # Existing comparison public support schema, without its fake natives.
        extra=M.build_extra_schema()
        extra=replace_once(extra,"alter table public.articles add column reader_state text not null default 'pending_review';")
        extra=replace_once(extra,"alter table public.articles add column source_status text not null default 'active';")
        extra=replace_once(extra,"create table public.nodes(id uuid primary key default gen_random_uuid(),payload jsonb not null default '{}'::jsonb);\n")
        if extra.count('create schema evidence_pipeline;')!=1:raise AssertionError('native fixture boundary changed')
        extra=extra.split('create schema evidence_pipeline;',1)[0]
        self.admin(extra)
        # Establish only the two selected synthetic articles before real native
        # history installation; no production reader eligibility is changed.
        self.admin('update public.articles set title='+q(M.TEXT)+',summary='+q(M.TEXT)+",body_text=null,reader_state='eligible',source_status='active',url='https://www.justice.gov/synthetic/'||id::text where id in ("+','.join(q(i)+'::uuid' for i in IDS)+');alter table public.articles alter column url set not null;')
        M.load(self.db,'supabase/migrations/20260905082406_evidence_pipeline_reliability.sql')
        # 030 supplies the actual bound native wrappers required by 035.
        for name in ['05_operation_ledger.sql','010_collection_gate.sql','020_run_ledger.sql','030_retain_upsert.sql','035_native_caller.sql']:
            M.load(self.db,C3+name)
            if name!='05_operation_ledger.sql':self.admin('select qik_ingest_operation.capture_step('+q(name)+');')
        for p in M.MANIFEST['authority_install_order']:
            M.load(self.db,p)
            if p.endswith('/006_collector_reconciliation.sql'):
                self.admin("create policy native_test_source_read on public.articles for select to mip_kernel_owner_v2,mip_collector_owner_v2 using(id in ('00000000-0000-4000-8000-000000000002'::uuid,'00000000-0000-4000-8000-000000000003'::uuid));insert into mip_identity.collector_config values(true,"+q(M.SOURCE)+');select mip_identity.capture_backlog();')
            if p.endswith('/007_survivor_release.sql'):
                self.admin("create policy native_test_publication_source_read on public.articles for select to mip_publication_owner_v2 using(id in ('00000000-0000-4000-8000-000000000002'::uuid,'00000000-0000-4000-8000-000000000003'::uuid));select mip_identity.install_survivor_fences();")
        self.assertEqual(self.admin('select count(*) from mip_identity.efta_scope'),'0')
        self.seed_sessions()
        self.seed_actual_c3()
        M.load(self.db,NEW)
        self.original_claims=self.admin('select jsonb_agg(claims order by id)::text from public.articles')
    def seed_sessions(self):
        self.sessions={};key=uid()
        self.admin('insert into mip_identity.key_versions values('+q(key)+",'https://synthetic.invalid','synthetic','{}','2020-01-01','2999-01-01','synthetic-only');insert into mip_identity.key_heads values('https://synthetic.invalid','synthetic',"+q(key)+',true);')
        for kind,role in M.ROLES.items():
            mapping=uid();session=uid();self.sessions[kind]=session
            self.admin('insert into mip_identity.mapping_versions values('+','.join(map(q,[mapping,M.RUNTIME,role,'https://synthetic.invalid','synthetic','synthetic-subject',key]))+",600,'synthetic-only');insert into mip_identity.mapping_heads values("+','.join(map(q,[M.RUNTIME,role,mapping]))+',true);insert into comparison_qualification.principal_sessions(session_id,principal,runtime_id,expires_at) values('+','.join(map(q,[session,role,M.RUNTIME]))+",'2999-01-01');insert into mip_identity.sessions values("+','.join(map(q,[session,uid(),uid().replace('-','')+uid().replace('-',''),mapping,key]))+",'2999-01-01','synthetic-only');")
        self.admin('insert into comparison_qualification.runtime_source_scope(runtime_id,source) values('+q(M.RUNTIME)+','+q(M.SOURCE)+');insert into comparison_qualification.evaluated_implementations(runtime_id,implementation) values('+q(M.RUNTIME)+','+q(M.IMPL)+');insert into mip_cutover_authority.runtime_config values('+q(M.RUNTIME)+','+q(M.SOURCE)+','+q(M.IMPL)+",'{\"entries\":[]}');")
        for kind,ops in {'worker':['worker_claim','worker_complete','worker_fail','worker_journal_put','worker_journal_get'],'producer':['producer_enqueue']}.items():
            for op in ops:self.admin('insert into comparison_qualification.runtime_bindings(runtime_id,principal,rpc_name) values('+','.join(map(q,[M.RUNTIME,M.ROLES[kind],op]))+');')
    def native(self,action,value):
        return json.loads(self.role(Q,'select public.mip_qik_ingest_native('+q(TOKEN)+','+q(self.run_id)+','+q(action)+','+js(value)+');'))
    def seed_actual_c3(self):
        outlet=uid();self.run_id='synthetic-doj-'+uid();self.material={}
        self.admin('insert into qik_ingest.runtime_credentials values('+q(digest(TOKEN))+",true,'synthetic qualification only');update qik_ingest.collection_gate set collection_authorized=true;insert into public.outlets(id,name) values("+q(outlet)+",'Synthetic DOJ fixture');insert into public.ingest_sources(id,outlet_id,feed_url,enabled,collection_enabled) values("+q(SOURCE_ID)+','+q(outlet)+','+q(FEED)+',true,true);')
        self.role(Q,'select public.mip_qik_ingest_begin_run('+q(TOKEN)+','+q(self.run_id)+',null);')
        for article_id in IDS:
            a=self.value('select to_jsonb(a) from public.articles a where id='+q(article_id))
            # Two synthetic source snapshots exercise the multi-outlet comparator;
            # this fixture is not evidence that a single DOJ outlet satisfies it.
            self.admin('update public.outlets set name='+q(a['outlet'])+' where id='+q(outlet))
            item={k:a[k] for k in ['url','title','summary','published_at']}
            o=json.loads(self.role(Q,'select public.mip_qik_ingest_retain_item('+q(TOKEN)+','+q(self.run_id)+','+q(SOURCE_ID)+','+js(item)+');'))
            job=self.native('enqueue',{'observation_id':o['id']})
            self.assertEqual(self.native('enqueue',{'observation_id':o['id']}),job)
            lease=self.native('claim',{'job_ids':[job]})
            finished=self.native('finish',{'job_id':job,'lease_token':lease['lease_token']})
            self.assertEqual(finished['article_id'],article_id)
            candidate=dict(capture_id=finished['capture_id'],candidate_key='synthetic-summary',candidate_kind='claim',statement=M.TEXT,source_field='summary',span_start=0,span_end=len(M.TEXT),excerpt=M.TEXT,extractor_version='synthetic-doj-v1',remaining_uncertainty='Synthetic test only.')
            self.native('candidate',{'job_id':job,'candidate':candidate})
            self.material[article_id]=dict(observation_id=o['id'],capture_id=finished['capture_id'],job_id=job)
        self.role(Q,'select public.mip_qik_ingest_finish_run('+q(TOKEN)+','+q(self.run_id)+",'completed','{}',null);")
    def insert_as_authority(self,table,record):
        self.role(A,'insert into mip_identity.'+table+' select x.* from jsonb_populate_record(null::mip_identity.'+table+','+js(record)+') x;')
    def prepare(self,applicability='verified_first_party_unmarked_doj_text'):
        self.reviewed()  # actual claim, worker bridge, journal retry, review source
        self.policy=dict(revision=uid(),source_project=M.SOURCE,source_id=SOURCE_ID,feed_url=FEED,policy_url='https://www.justice.gov/legalpolicies',policy_version='synthetic-policy-fixture-v1',policy_document_hash=digest('synthetic primary-policy document'),policy_clause_hash=digest('synthetic conditional policy clause'),policy_record_ref='synthetic-policy-record',policy_observed_at='2026-01-01T00:00:00Z',owner_record_ref='synthetic-owner-instruction',owner_instruction_hash=digest('synthetic private instruction'),owner_principal_ref='synthetic-owner',audience='isolated_internal_review',operations=['retention','analysis','excerpt_display'],fields=['source_identity','original_url','title','published_at','short_feed_summary','native_capture_bytes_hash'],effective_at='2020-01-01T00:00:00Z',expires_at='2999-01-01T00:00:00Z',owner_field_signature=None)
        self.insert_as_authority('doj_policy_versions',self.policy)
        self.bindings={}
        for article_id,m in self.material.items():
            version=self.admin("select comparison_qualification.argument_digest(m.value->'article') from comparison_qualification.generations g cross join lateral jsonb_array_elements(g.input_payload->'eventInputs') e cross join lateral jsonb_array_elements(e.value->'members') m where g.id="+q(self.generation)+" and m.value->'article'->>'id'="+q(article_id)+';')
            b=dict(revision=uid(),policy_revision=self.policy['revision'],article_id=article_id,capture_id=m['capture_id'],observation_id=m['observation_id'],article_version=version,capture_hash=self.admin('select content_hash from evidence_pipeline.article_captures where id='+q(m['capture_id'])),source_receipt_ref='synthetic-receipt:'+m['job_id'],source_receipt_hash=self.admin("select encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') from evidence_pipeline.import_receipts r where job_id="+q(m['job_id'])+' and run_id='+q(self.run_id)),selection_record_ref='synthetic-selection:'+article_id,selection_record_hash=digest('synthetic exception review:'+article_id),applicability=applicability)
            self.insert_as_authority('doj_material_bindings',b);self.bindings[article_id]=b
        self.insert_as_authority('doj_policy_heads',dict(source_project=M.SOURCE,revision=self.policy['revision'],active=True))
        self.scopes=self.value('select jsonb_agg(scope order by scope::text) from mip_identity.operation_evidence_heads where scope->>'+q('source_project')+'='+q(M.SOURCE))
        self.records={}
        for scope in self.scopes:
            b=self.bindings[scope['material_ref'].split(':',1)[1]];p=self.policy
            conditions=[dict(status='verified',evidence_ref=p['policy_record_ref'],document_hash=p['policy_document_hash'],clause_hash=p['policy_clause_hash'],policy_revision=p['revision']),dict(status='verified',evidence_ref=p['owner_record_ref'],instruction_hash=p['owner_instruction_hash']),dict(status='verified',evidence_ref=b['selection_record_ref'],selection_hash=b['selection_record_hash'],receipt_hash=b['source_receipt_hash'],binding_revision=b['revision'])]
            v=dict(revision=uid(),scope=scope,authority_adapter='doj-private-policy-v1',source_ref=FEED,source_version=b['capture_id'],source_hash=b['capture_hash'],evidence_ref=p['policy_record_ref'],approval_owner_ref=p['owner_principal_ref'],approval_record_ref=p['owner_record_ref'],approval_status='recorded',disposition='allow',effective_at='2020-01-01T00:00:00Z',expires_at='2999-01-01T00:00:00Z',conditions=conditions,synthetic=False)
            self.insert_as_authority('operation_evidence_versions',v)
            self.role(A,'update mip_identity.operation_evidence_heads set revision='+q(v['revision'])+',active=true where scope='+js(scope)+';')
            self.records[json.dumps(scope,sort_keys=True)]=v
    def decision(self,scope):return json.loads(self.role(U,'select mip_identity.operation_check('+js(scope)+');'))
    def test_doj_private_actual_c3_journal_review_reader(self):
        self.prepare()
        self.assertEqual(len(self.scopes),12)
        for scope in self.scopes:
            d=self.decision(scope);self.assertTrue(d['allowed'],d)
            self.assertFalse(d['synthetic']);self.assertFalse(d['public_release_allowed']);self.assertIsNone(d['owner_field_signature'])
            self.assertEqual(d['rights_basis'],'DOJ_primary_policy_with_item_exception_review')
            self.assertEqual(d['privacy_basis'],'owner_authorized_private_processing')
        self.release()
        self.assertEqual(self.admin('select jsonb_agg(claims order by id)::text from public.articles'),self.original_claims)
        self.assertEqual(self.admin("select count(*) from evidence_pipeline.evidence_candidates where review_state<>'pending'"),'0')
        self.assertEqual(self.admin('select count(*) from mip_identity.review_operation_bindings where review_revision='+q(self.review)),'1')
    def test_doj_scope_substitution_denied(self):
        self.prepare();scope=self.scopes[0]
        changes=[('source_project','other-synthetic-project'),('material_ref','article:'+uid()),('material_version','0'*64),('audience','public'),('domain','other'),('operation','ingestion'),('operation','redistribution'),('operation','external_model_disclosure'),('operation','full_content_display'),('extra','not allowed'),('material_ref',{'nested':'not allowed'})]
        for key,value in changes:
            with self.subTest(key=key,value=value):self.assertFalse(self.decision(dict(scope,**{key:value}))['allowed'])
    def test_doj_unresolved_item_exception_denied(self):
        self.prepare('unresolved')
        self.assertFalse(self.decision(self.scopes[0])['allowed'])
        with self.assertRaises(RuntimeError):self.release()
    def test_doj_operation_record_hash_mismatch_denied(self):
        self.prepare();scope=self.scopes[0];v=dict(self.records[json.dumps(scope,sort_keys=True)],revision=uid(),source_hash='0'*64)
        self.insert_as_authority('operation_evidence_versions',v)
        self.role(A,'update mip_identity.operation_evidence_heads set revision='+q(v['revision'])+' where scope='+js(scope))
        self.assertEqual(self.decision(scope)['reason'],'doj_record_binding_mismatch')
    def test_doj_policy_revocation_refuses_accepted_reader(self):
        self.prepare();self.release()
        self.role(A,'update mip_identity.doj_policy_heads set active=false where source_project='+q(M.SOURCE))
        self.assertFalse(self.decision(self.scopes[0])['allowed'])
        with self.assertRaises(RuntimeError):self.read()
    def test_doj_exact_material_resolver_failures_and_restore(self):
        self.prepare();scope=self.scopes[0];b=self.bindings[scope['material_ref'].split(':',1)[1]]
        queries=[
          'update qik_ingest.observed_items set body_text='+q('synthetic forbidden page body')+' where id='+q(b['observation_id']),
          'update qik_ingest.observed_items set source_id='+q('11111111-1111-4111-8111-111111111111')+' where id='+q(b['observation_id']),
          'update public.ingest_sources set feed_url='+q('https://synthetic.invalid/wrong-feed')+' where id='+q(SOURCE_ID),
          'revoke select on evidence_pipeline.import_receipts from qik_ingest_fn_owner',
          "alter policy qik_ingest_native_select on evidence_pipeline.article_captures using(false)",
        ]
        for mutation in queries:
            with self.subTest(mutation=mutation):
                sql='begin;'+mutation+';set local role '+U+';select mip_identity.operation_check('+js(scope)+');rollback;'
                try:result=json.loads(self.admin(sql));self.assertFalse(result['allowed'])
                except RuntimeError as error:self.assertIn('permission denied',str(error))
                self.assertTrue(self.decision(scope)['allowed'])
    def test_doj_authority_role_and_runtime_forgery_denied(self):
        self.prepare()
        for role in ['anon','authenticated','service_role',Q,'qik_ingest_fn_owner',*M.ROLES.values()]:
            for table in ['doj_policy_versions','doj_policy_heads','doj_material_bindings']:
                with self.subTest(role=role,table=table):
                    with self.assertRaises(RuntimeError):self.role(role,'select * from mip_identity.'+table)
            with self.assertRaises(RuntimeError):self.role(role,'select mip_identity.operation_check('+js(self.scopes[0])+')')
        with self.assertRaises(RuntimeError):self.role(A,'delete from mip_identity.doj_policy_heads where source_project='+q(M.SOURCE))
        with self.assertRaises(RuntimeError):self.role(A,'update mip_identity.doj_policy_heads set source_project='+q('changed'))
        with self.assertRaises(RuntimeError):self.insert_as_authority('doj_policy_versions',dict(self.policy,revision=uid(),source_project='cc-definition-batch-v1'))
        v=dict(next(iter(self.records.values())),revision=uid(),authority_adapter='synthetic-fixture-v1',synthetic=True)
        with self.assertRaises(RuntimeError):self.insert_as_authority('operation_evidence_versions',v)
    def test_doj_preserves_legacy_dispatch_without_historical_material(self):
        self.prepare()
        for project in ['cc-definition-batch-v1','efta-bounded-demo-v1','unrelated-synthetic-project']:
            scope=dict(self.scopes[0],source_project=project)
            actual=self.decision(scope)
            prior=json.loads(self.role(U,'select mip_identity.operation_check_pre_doj_v1('+js(scope)+')'))
            self.assertEqual(actual,prior)
        self.assertEqual(self.admin('select count(*) from mip_identity.efta_scope'),'0')
    def test_doj_final_catalog_rejects_drift(self):
        s=(ROOT/NEW).read_text();start='do $final_doj_permissions$';end='end $final_doj_permissions$;'
        if s.count(start)!=1 or s.count(end)!=1:raise AssertionError('final assertion boundary changed')
        checks=s[s.index(start):s.index(end)+len(end)]
        for mutation in [
          'alter table mip_identity.doj_material_bindings no force row level security',
          'grant select on mip_identity.doj_policy_versions to qik_ingest_runtime',
          'grant execute on function mip_identity.operation_check(jsonb) to service_role',
          'alter function qik_ingest.check_doj_material(uuid,uuid,uuid) security invoker',
          'grant mip_cutover_authority_admin_v1 to qik_ingest_runtime',
          'alter policy doj_admin_insert on mip_identity.doj_policy_versions with check(false)',
        ]:
            with self.subTest(mutation=mutation):
                with self.assertRaises(RuntimeError):self.admin('begin;'+mutation+';'+checks+'rollback;')
                self.admin(checks)

if __name__=='__main__':
    names=sorted(n for n in DOJ.__dict__ if n.startswith('test_doj_'))
    if len(names)!=9:raise SystemExit('unexpected synthetic test inventory')
    result=unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(DOJ(n) for n in names))
    raise SystemExit(not result.wasSuccessful())
