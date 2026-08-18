# Google Cloud Boundary Baseline — 2026-08-18

The authenticated Google Cloud Console was opened for inspection only before any changes were made.

| Item | Verified observation |
|---|---|
| Active project display name | `Mop-extraction` |
| Active project ID | `mop-extraction` |
| Active project number | `67736603141` |
| Authenticated account | An authenticated owner Google account was present in the console session. |
| Change status at capture | No resource, service, IAM, API, billing, or credential mutation was made. |
| Boundary rule | Work may proceed only after confirming that this project is the designated isolated v2 workload boundary and not the MIP production project or any production-linked project. |

The project identifier is recorded for ownership and cleanup purposes only. No secret values are recorded in this file.

## Cloud Run inspection

The selected `mop-extraction` project is explicitly hard-coded in the repository's existing manual Cloud Run deployment workflow for the `mop-extraction` service in `us-central1`. The Cloud Run services inventory was opened in read-only inspection mode. This establishes that the project is already coupled to an existing MIP extraction deployment, not a newly created v2-only cloud workspace. No deployment, API enablement, IAM change, credential creation, billing change, or service update was performed.

**Execution boundary:** this existing Google Cloud project will not be modified during the v2 work without a separate owner confirmation that it is not the main-platform extraction project. The independently named Supabase project `mip-v2-manus-sandbox-20260818` remains the authorized service-side sandbox.
