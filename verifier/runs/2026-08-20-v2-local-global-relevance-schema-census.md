# V2 local/global relevance — schema and metadata census

**Target:** Isolated V2 sandbox `yhbwnrtlqbjtcrrlpbge`. **Method:** Read-only schema and count query. No profile, outlet, topic, location, or article record was modified.

| Measure | Result |
|---|---:|
| `mip_profiles` rows | 0 |
| `mip_profiles` columns | `id`, `display_name`, `created_at` |
| Curated `outlets` rows | 5 |
| Curated outlets with `country` | 4 |
| Outlet locality fields (city, region, postcode, media market, service area) | 0 |
| Distinct non-null `articles.outlet` labels | 2,573 |
| `topics` rows | 25 |
| `node_topics` links | 0 |
| `geographic_places` rows | 4 |
| `node_location_mentions` rows | 4 |

The current database supports neither a reliable outlet-service-area lookup nor a populated node/topic association layer for a user-local or globally salient ranking feature. This is a readiness finding only; it does not authorize an implementation.
