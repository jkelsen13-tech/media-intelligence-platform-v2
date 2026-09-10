-- Synthetic source schema only; NEVER a production migration.
create table public.events (
 id uuid primary key,canonical_title text,status text,comparison_validation_state text,
 occurred_at_start date,occurred_at_end date
);
create table public.articles (
 id uuid primary key,outlet text,title text,url text,summary text,body_text text,
 published_at timestamptz,claims jsonb,embedding text,unattributed boolean,monoculture boolean,is_digest boolean
);
create table public.event_articles (
 event_id uuid references public.events(id),article_id uuid references public.articles(id),
 membership_method text,membership_confidence numeric,created_at timestamptz,
 primary key(event_id,article_id)
);
create table public.pipeline_config (key text primary key,value jsonb,updated_at timestamptz);
insert into public.events values
 ('00000000-0000-4000-8000-000000000001','Council water funding','active','approved','2026-01-01','2026-01-01');
insert into public.articles(id,outlet,title,summary,published_at,claims) values
 ('00000000-0000-4000-8000-000000000002','Outlet A','Council approves water infrastructure funding','Council approves water infrastructure funding','2026-01-01 00:00:00.123456+00','{"n":9007199254740993}'),
 ('00000000-0000-4000-8000-000000000003','Outlet B','Council approves water infrastructure funding','Council approves water infrastructure funding','2026-01-01 00:00:00.123457+00','{"n":9007199254740994}');
insert into public.event_articles values
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','reviewed',0.123456789012345678,'2026-01-01 00:00:00.123456+00'),
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','reviewed',0.987654321098765432,'2026-01-01 00:00:00.123457+00');
insert into public.pipeline_config values ('claim_group_confidence_floor','0.6','2026-01-01 00:00:00.123456+00');
