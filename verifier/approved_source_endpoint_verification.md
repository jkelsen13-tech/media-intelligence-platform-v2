# Approved Ingestion Source Endpoint Verification

**Scope:** Isolated v2 ingestion pipeline source catalog. Verification performed on 2026-08-19.

| Source | Candidate endpoint | Observed result | Catalog decision |
|---|---|---:|---|
| GDELT DOC 2.0 | `https://api.gdeltproject.org/api/v2/doc/doc` | The tested query returned HTTP 429 during a rapid probe, which demonstrates rate limiting rather than a durable feed failure. | Enabled with a mandatory request interval and exponential-backoff handling. |
| U.S. Department of Justice | `https://www.justice.gov/news/rss?type=press_release&m=1` | The official DOJ Press Releases page exposes this URL as its RSS Feed. | Enabled as an official publisher feed. |
| BBC News | `https://feeds.bbci.co.uk/news/rss.xml` | HTTP 200 and `text/xml`. | Enabled as a publisher feed. |
| NPR | `https://feeds.npr.org/1001/rss.xml` | HTTP 200 and RSS XML content type. | Enabled as a publisher feed. |
| Reuters | Former `feeds.reuters.com` endpoint | DNS resolution failed. | Not enabled as a direct RSS poller; Reuters discovery is limited to GDELT results whose publisher URL is `reuters.com`. |
| AP News | `https://apnews.com/hub/ap-top-news` | HTTP 200 but HTML, not RSS. | Not enabled as a direct RSS poller; AP discovery is limited to GDELT results whose publisher URL is `apnews.com`. |

No endpoint is represented as an active RSS feed unless that feed was observed to be public and machine-readable. Articles from Reuters and AP News may still be source-mapped when GDELT returns the original publisher URL; the discovery provenance is explicitly retained as GDELT.

## References

[1]: https://www.gdeltproject.org/data.html "The GDELT Project — Data"
[2]: https://www.justice.gov/news/press-releases "U.S. Department of Justice — Press Releases"
[3]: https://www.bbc.co.uk/news/10628494 "BBC News — News Feeds"
