-- Manifest: v2-outlet-region-metadata-2026-08-19
-- Scope: Country-level publisher/contact metadata for existing outlet rows only.
-- Provenance register: verifier/outlet_region_metadata_sources_2026-08-19.md
-- This supplies an honest Region filter affordance. It does not describe article
-- geography, ownership, editorial independence, popularity, reliability, or a
-- composite score. CNN remains null because this seed does not have a direct
-- publisher source for an equivalent country-level contact record.
-- Rollback: set country = NULL for the four listed names only if the values
-- are still the exact values introduced by this manifest.

BEGIN;

UPDATE public.outlets
SET country = CASE name
  WHEN 'Al Jazeera' THEN 'Qatar'
  WHEN 'BBC News' THEN 'United Kingdom'
  WHEN 'Fox News' THEN 'United States'
  WHEN 'The New York Times' THEN 'United States'
  ELSE country
END
WHERE name IN ('Al Jazeera', 'BBC News', 'Fox News', 'The New York Times')
  AND country IS NULL;

COMMIT;

SELECT name, country
FROM public.outlets
WHERE name IN ('Al Jazeera', 'BBC News', 'Fox News', 'The New York Times', 'CNN')
ORDER BY name ASC
LIMIT 10;
