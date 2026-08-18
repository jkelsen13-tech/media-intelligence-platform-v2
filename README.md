# media-intelligence-platform

MIP: Media Intelligence Platform — Interactive knowledge graph for tracking news stories, info ops, accountability arcs, and silence anomalies. Built with React + Vite + Cytoscape.js, backed by Supabase.

## Quick start

```bash
npm install
npm run dev
```

With no Supabase credentials configured, the app renders the bundled demo dataset (Fort Campbell drone theft story).

## Status

- Backend: **live** — Supabase project `SUPABASE_PRODUCTION_REF_REDACTED` (us-west-2).
- Graph: 11 nodes / 14 edges (Fort Campbell accountability arc), anon read-only RLS.
- Live news: `ingest-rss` edge function deployed (v2), scheduled via pg_cron every 6 hours — first run ingested 200 articles from 8 international outlets into `public.articles`.
- Frontend builds clean (`npm run build`). With `.env` configured, header shows `data: supabase`.

## Features

- **Knowledge graph** (primary interface) — octagonal nodes typed by color (event/actor/institution/document/anomaly), degree-scaled sizing, typed + weighted edges, hover focus (connected edges light up, the rest fades).
- **Article panel** (§4.4) — click any node: slide-in panel with category tag, confidence score (red→green gradient), synthesis summary, source list (outlet / headline / date / link), and connected-node navigation. Pinnable.
- **Causal timeline** (§2.4) — events ordered by date with documented causal links between them; confidence labels throughout.
- **Story Arcs** (§2.5) — longitudinal tracking: arc status (Active/Dormant/Resolved/Cold), arc-age bar, milestone checklist (Pending / Confirmed Complete / Confirmed Failed / Unresolved), consequence timeline with per-event confidence (confirmed/corroborated/inferred), and coverage-gap flag when developments outpace coverage.
- **RSS ingestion** — edge function fetches 8 ideologically/geographically diverse feeds (BBC, Al Jazeera, Guardian, NYT, NPR, Democracy Now!, SCMP, Times of India) and upserts into `public.articles`; runs every 6 hours via pg_cron.

## Supabase setup

1. In your Supabase project, open **SQL Editor** and run `supabase/schema.sql`, then `supabase/seed.sql` (or apply `supabase/migrations/20260723_panel_arcs_ingestion.sql` for the full current schema).
2. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from **Project Settings → API**.
3. Restart `npm run dev`. The header shows `data: supabase` when it's reading from the database.

## Graph vocabulary

**Nodes** are octagons; border color encodes type, size scales with connection count.

| Type | Color |
| --- | --- |
| event | blue |
| actor | grey |
| institution | amber |
| document | green |
| anomaly | red |

**Edges** are colored by relationship type — causal (blue), actor (grey), financial (amber), conflict (red), documentary (green) — with thickness by weight: heavy, medium, light.

## Layout

- `src/graph/theme.js` — shared color/weight vocabulary
- `src/graph/styles.js` — Cytoscape stylesheet (octagons, degree-based sizing, edge styling, hover focus)
- `src/graph/GraphView.jsx` — Cytoscape canvas component
- `src/panels/ArticlePanel.jsx` — node article panel (confidence, sources, connections)
- `src/views/TimelineView.jsx` — causal timeline
- `src/views/ArcsView.jsx` — story arcs list + arc panel
- `src/data/demoData.js` — demo story dataset (mirrors the DB seed)
- `src/lib/supabase.js` — Supabase client + loaders with demo fallback
- `supabase/schema.sql`, `supabase/seed.sql` — original graph schema and seed
- `supabase/migrations/20260723_panel_arcs_ingestion.sql` — full current schema
- `supabase/functions/ingest-rss/index.ts` — RSS ingestion edge function
