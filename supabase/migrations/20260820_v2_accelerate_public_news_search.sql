-- Isolated Version Two only. The public News search is intentionally a
-- substring search across the title, summary, and retained article text.
-- These indexes preserve that contract while avoiding a full-table scan and
-- statement timeout on the live corpus. They do not alter any table grant,
-- RLS policy, view contract, or returned field.

create extension if not exists pg_trgm with schema extensions;

create index if not exists articles_title_trgm_idx
  on public.articles using gin (title extensions.gin_trgm_ops);

create index if not exists articles_summary_trgm_idx
  on public.articles using gin (summary extensions.gin_trgm_ops);

create index if not exists articles_body_text_trgm_idx
  on public.articles using gin (body_text extensions.gin_trgm_ops);
