-- Isolated v2 geographic seed — 2026-08-19.
--
-- Scope: four city names appearing literally in the headlines of three existing,
-- source-mapped U.S. Department of Justice records. This seed does not geocode
-- the general corpus, infer locations, or assert exact event coordinates.
--
-- Gazetteer representative points: OpenStreetMap Nominatim lookup log in
-- verifier/geographic_place_source_notes_2026-08-19.md. Display must preserve
-- city precision and the uncertainty note below.
--
-- Rollback: delete FROM public.node_location_mentions WHERE extraction_version
-- = 'v2-geographic-seed-2026-08-19'; then delete the four named provider IDs
-- from public.geographic_places if no other mention references them.

BEGIN;

DELETE FROM public.node_location_mentions
WHERE extraction_version = 'v2-geographic-seed-2026-08-19';

INSERT INTO public.geographic_places (
  canonical_name, country_code, admin1_name, latitude, longitude, precision,
  gazetteer_provider, gazetteer_id
)
VALUES
  ('Louisville, Kentucky, United States', 'US', 'Kentucky', 38.254238, -85.759407, 'city', 'nominatim-osm', 'relation:1804307'),
  ('Minneapolis, Minnesota, United States', 'US', 'Minnesota', 44.977300, -93.265469, 'city', 'nominatim-osm', 'relation:136712'),
  ('Seattle, Washington, United States', 'US', 'Washington', 47.603832, -122.330062, 'city', 'nominatim-osm', 'relation:237385'),
  ('Norfolk, Virginia, United States', 'US', 'Virginia', 36.849370, -76.289954, 'city', 'nominatim-osm', 'relation:206672')
ON CONFLICT (gazetteer_provider, gazetteer_id) DO UPDATE SET
  canonical_name = EXCLUDED.canonical_name,
  country_code = EXCLUDED.country_code,
  admin1_name = EXCLUDED.admin1_name,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  precision = EXCLUDED.precision,
  updated_at = now();

INSERT INTO public.node_location_mentions (
  node_id, article_id, place_id, mention_text, text_field, location_role,
  literal_status, resolution_method, review_state, remaining_uncertainty,
  extraction_version
)
SELECT
  n.id,
  a.id,
  gp.id,
  seeded.mention_text,
  'headline',
  'event',
  'literal',
  'source_record',
  'confirmed',
  'The primary-source headline names this city. The displayed point is a city-level representative coordinate, not an exact event, facility, or neighborhood location.',
  'v2-geographic-seed-2026-08-19'
FROM (
  VALUES
    (
      'evt-doj-louisville-minneapolis-dismissal-20250521',
      'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and',
      'nominatim-osm', 'relation:1804307', 'Louisville'
    ),
    (
      'evt-doj-louisville-minneapolis-dismissal-20250521',
      'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and',
      'nominatim-osm', 'relation:136712', 'Minneapolis'
    ),
    (
      'evt-doj-seattle-support-20250723',
      'https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree',
      'nominatim-osm', 'relation:237385', 'Seattle'
    ),
    (
      'evt-doj-norfolk-termination-20250813',
      'https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree',
      'nominatim-osm', 'relation:206672', 'Norfolk'
    )
) AS seeded(node_slug, article_url, gazetteer_provider, gazetteer_id, mention_text)
JOIN public.nodes n ON n.slug = seeded.node_slug
JOIN public.articles a ON a.url = seeded.article_url
JOIN public.geographic_places gp
  ON gp.gazetteer_provider = seeded.gazetteer_provider
 AND gp.gazetteer_id = seeded.gazetteer_id;

COMMIT;
