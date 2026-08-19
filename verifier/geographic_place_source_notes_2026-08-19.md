# Geographic Seed Source Notes — 2026-08-19

This note records the **gazetteer lookup** used only to supply a city-level representative point for locations explicitly named in existing primary-source DOJ records. It is not evidence that an event occurred at an exact coordinate, street address, facility, or neighborhood.

| Canonical place | Source record | Representative latitude | Representative longitude | Intended database precision |
|---|---:|---:|---:|---|
| Louisville, Kentucky, United States | [Nominatim relation 1804307](https://nominatim.openstreetmap.org/search?q=Louisville%2C+Kentucky%2C+USA&format=jsonv2&limit=1) | 38.2542376 | -85.7594070 | `city` |
| Minneapolis, Minnesota, United States | [Nominatim relation 136712](https://nominatim.openstreetmap.org/search?q=Minneapolis%2C+Minnesota%2C+USA&format=jsonv2&limit=1) | 44.9772995 | -93.2654692 | `city` |

The application must label these as **city-level representatives**, retain the originating text span and source article separately, and must never present them as exact event coordinates. Nominatim is powered by OpenStreetMap data under the ODbL license.
| Seattle, Washington, United States | [Nominatim relation 237385](https://nominatim.openstreetmap.org/search?q=Seattle%2C+Washington%2C+USA&format=jsonv2&limit=1) | 47.6038321 | -122.3300620 | `city` |
| Norfolk, Virginia, United States | [Nominatim relation 206672](https://nominatim.openstreetmap.org/search?q=Norfolk%2C+Virginia%2C+USA&format=jsonv2&limit=1) | 36.8493695 | -76.2899539 | `city` |

> **Display rule:** every rendered map marker is a city-level representative point. The platform will identify it as such, preserve a literal named-city source mention, and suppress unreviewed candidates from the confirmed-location layer.
