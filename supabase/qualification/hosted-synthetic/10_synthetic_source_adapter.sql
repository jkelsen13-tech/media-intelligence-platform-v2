-- Hosted-synthetic source adapter. Isolated qualification only.
-- Not a production migration. Do not apply without owner paste-allowance.
-- qik (qikvmopbtijoebdqosyq) only. Never create or write public.events/articles.
-- Load after comparison-generations/contract.sql, selection.sql, and capability.sql.
-- SKIP source-fixture.sql and SKIP stock source-snapshot.sql.
begin;

create table comparison_qualification.synthetic_events (
 id uuid primary key,canonical_title text,status text,comparison_validation_state text,
 occurred_at_start date,occurred_at_end date
);
create table comparison_qualification.synthetic_articles (
 id uuid primary key,outlet text,title text,url text,summary text,body_text text,
 published_at timestamptz,claims jsonb,embedding text,unattributed boolean,monoculture boolean,is_digest boolean
);
create table comparison_qualification.synthetic_event_articles (
 event_id uuid references comparison_qualification.synthetic_events(id),
 article_id uuid references comparison_qualification.synthetic_articles(id),
 membership_method text,membership_confidence numeric,created_at timestamptz,
 primary key(event_id,article_id)
);
create table comparison_qualification.synthetic_pipeline_config (
 key text primary key,value jsonb,updated_at timestamptz
);

-- Same synthetic rows as source-fixture.sql, bound to synthetic_* only.
insert into comparison_qualification.synthetic_events values
 ('00000000-0000-4000-8000-000000000001','Council water funding','active','approved','2026-01-01','2026-01-01');
insert into comparison_qualification.synthetic_articles(id,outlet,title,summary,published_at,claims) values
 ('00000000-0000-4000-8000-000000000002','Outlet A','Council approves water infrastructure funding','Council approves water infrastructure funding','2026-01-01 00:00:00.123456+00','{"n":9007199254740993}'),
 ('00000000-0000-4000-8000-000000000003','Outlet B','Council approves water infrastructure funding','Council approves water infrastructure funding','2026-01-01 00:00:00.123457+00','{"n":9007199254740994}');
insert into comparison_qualification.synthetic_event_articles values
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','reviewed',0.123456789012345678,'2026-01-01 00:00:00.123456+00'),
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','reviewed',0.987654321098765432,'2026-01-01 00:00:00.123457+00');
insert into comparison_qualification.synthetic_pipeline_config values ('claim_group_confidence_floor','0.6','2026-01-01 00:00:00.123456+00');

alter table comparison_qualification.synthetic_events enable row level security;
alter table comparison_qualification.synthetic_articles enable row level security;
alter table comparison_qualification.synthetic_event_articles enable row level security;
alter table comparison_qualification.synthetic_pipeline_config enable row level security;
revoke all on comparison_qualification.synthetic_events,comparison_qualification.synthetic_articles,
  comparison_qualification.synthetic_event_articles,comparison_qualification.synthetic_pipeline_config
  from public,anon,authenticated,service_role;

-- CREATE OR REPLACE stock source_snapshot / capture_source. Worker, journal, and
-- broker RPCs are unchanged: only the snapshot read set is rebound.
create or replace function comparison_qualification.source_snapshot(p_lexicon jsonb,p_implementation text)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare payload jsonb;
begin
  if p_lexicon is null or jsonb_typeof(p_lexicon)<>'object' or p_implementation is null
    or length(p_implementation) not between 1 and 300 then
    raise exception 'invalid comparison snapshot binding';
  end if;
  -- STABLE pins all source reads to the calling statement's MVCC snapshot.
  -- Retain complete selected rows, including membership provenance and gate fields.
  with eligible as (
    select e.id from comparison_qualification.synthetic_events e
    join comparison_qualification.synthetic_event_articles m on m.event_id=e.id
    join comparison_qualification.synthetic_articles a on a.id=m.article_id
    where e.status<>'timeline_only' and e.comparison_validation_state='approved'
    group by e.id having count(distinct nullif(a.outlet,''))>=2
  ), inputs as (
    select e.id,jsonb_build_object('event',to_jsonb(e),'members',
      (select jsonb_agg(jsonb_build_object('article',to_jsonb(a),'membership',to_jsonb(m)) order by m.article_id)
       from comparison_qualification.synthetic_event_articles m
       join comparison_qualification.synthetic_articles a on a.id=m.article_id
       where m.event_id=e.id)) value
    from comparison_qualification.synthetic_events e join eligible chosen on chosen.id=e.id
  )
  select jsonb_build_object(
    'eventInputs',coalesce((select jsonb_agg(value order by id) from inputs),'[]'::jsonb),
    'configRows',coalesce((select jsonb_agg(to_jsonb(c) order by c.key)
      from comparison_qualification.synthetic_pipeline_config c
      where c.key='claim_group_confidence_floor'),'[]'::jsonb),
    'lexicon',p_lexicon,'implementation_ref',p_implementation,
    'snapshot_metadata',jsonb_build_object('database_snapshot',pg_current_snapshot()::text,
      'statement_started_at',statement_timestamp(),'scope','approved multi-outlet comparison inputs')
  ) into payload;
  return payload;
end $$;

create or replace function comparison_qualification.capture_source(p_lexicon jsonb,p_implementation text)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare payload jsonb;
begin
  select comparison_qualification.source_snapshot(p_lexicon,p_implementation) into payload;
  -- The namespace is deliberately synthetic. Not a production source attestation.
  return comparison_qualification.enqueue('qualification-source',payload,p_implementation,clock_timestamp());
end $$;
revoke all on function comparison_qualification.source_snapshot(jsonb,text),
  comparison_qualification.capture_source(jsonb,text) from public,anon,authenticated,service_role;
-- No EXECUTE to service_role / anon / authenticated. 002 grants EXECUTE of
-- source_snapshot to mip_comparison_producer_owner_v1 for producer_enqueue.
-- Hosted-synthetic must not restore the stock snapshot's service_role grant.
commit;
