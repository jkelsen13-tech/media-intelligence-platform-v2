-- V2 News Feed intake-quality gate.
--
-- This is a reader-eligibility layer, not an assertion that all retained
-- records are editorially complete. It preserves article rows and their
-- provenance while (a) withholding objectively malformed/unavailable titles,
-- (b) collapsing exact canonical-URL duplicates, and (c) sending new records
-- to review by default. Promotional and off-mission decisions remain explicit
-- human-review states rather than ungrounded automatic classification.

alter table public.articles
  add column if not exists reader_state text not null default 'pending_review';

alter table public.articles
  add column if not exists reader_exclusion_reason text;

alter table public.articles
  drop constraint if exists articles_reader_state_check;

alter table public.articles
  add constraint articles_reader_state_check
  check (reader_state in ('eligible', 'pending_review', 'withheld'));

alter table public.articles
  drop constraint if exists articles_reader_exclusion_reason_check;

alter table public.articles
  add constraint articles_reader_exclusion_reason_check
  check (
    reader_exclusion_reason is null
    or reader_exclusion_reason in (
      'malformed_title',
      'unavailable_page',
      'canonical_url_duplicate',
      'promotional_material',
      'off_mission',
      'manual_hold'
    )
  );

comment on column public.articles.reader_state is
  'News Feed reader eligibility. eligible may render in the reader; pending_review is retained but withheld pending relevance/quality review; withheld is excluded with a recorded reason. This state is not a source reliability or factual-truth score.';
comment on column public.articles.reader_exclusion_reason is
  'Bounded reason for withholding a News Feed record. Promotional/off-mission decisions require explicit review; the migration only automatically marks objectively malformed, unavailable, or exact canonical-URL duplicate records.';

create index if not exists articles_reader_state_published_idx
  on public.articles (reader_state, published_at desc);

-- Preserve current visible corpus by default, then apply only deterministic
-- corrections. Every excluded row remains in the base table for authorized
-- review, audit, and source preservation.
update public.articles
set reader_state = 'eligible',
    reader_exclusion_reason = null
where reader_state = 'pending_review';

-- URL values copied into a title field cannot serve as a reader headline.
update public.articles
set reader_state = 'withheld',
    reader_exclusion_reason = 'malformed_title'
where title is null
   or btrim(title) = ''
   or title ~* '^https?://'
   or title ~* '^www\.';

-- Availability/error pages are publisher-access artifacts, not article titles.
update public.articles
set reader_state = 'withheld',
    reader_exclusion_reason = 'unavailable_page'
where reader_state = 'eligible'
  and (
    title ~* '^(404|403|access denied|page not found|not found|unavailable)\b'
    or title ~* '\b(404|access denied|page not found)\b'
  );

-- Exact canonical-URL copies (case/tracking-query differences only) retain the
-- earliest recorded row. Reposts under distinct publisher URLs are not guessed
-- as duplicates and remain eligible until a reviewer decides otherwise.
with ranked_urls as (
  select
    id,
    row_number() over (
      partition by lower(regexp_replace(url, '\?.*$', ''))
      order by published_at nulls last, fetched_at nulls last, id
    ) as duplicate_rank
  from public.articles
  where reader_state = 'eligible'
    and url is not null
    and btrim(url) <> ''
)
update public.articles a
set reader_state = 'withheld',
    reader_exclusion_reason = 'canonical_url_duplicate'
from ranked_urls r
where a.id = r.id
  and r.duplicate_rank > 1;
