# Retained source history and assessment context

The private investigation workspace now compares retained captures of the same recorded article identity. Source History uses the displayed version's observation, offers two capture selectors, compares exact retained fields, opens full records, and shows selected assessments whose context includes either capture. Desktop comparisons use two columns; phone comparisons stack with repeated labels.

## Boundaries and invariants

- Group only by the saved capture's `article_id`. Shared URLs, outlets, publication dates or text never merge different article identities. These groups describe article versions, not independently verified source origins or transmission chains.
- Order captures by exact durable input position without converting bigint strings to JavaScript numbers. This is input order, not publication chronology, event chronology or first appearance anywhere on the web.
- Read only the supplied saved snapshot. Unavailable captures remain unavailable. Later corrections cannot appear in an earlier saved observation.
- Compare full raw string values, including whitespace, Unicode and qualifiers. Missing, empty and equal strings have separate states. A field difference does not establish a correction or semantic contradiction; absent retained text does not establish publisher deletion.
- Display selected assessment context membership exactly, including inherited inputs. Shared dependencies and duplicate membership entries never increase the displayed assessment count. Missing context remains unresolved. Context membership does not establish support, independence, or a changed conclusion under withdrawal.
- Keep source and assessment disclosures local to the selected saved version. No read, disclosure, selection or comparison writes a review marker, runs evidence checks, updates assessments or alters publication eligibility.

Sources and assessments reveal ten at a time. Source content and field text mount on disclosure. Long text previews show 1,200 Unicode code points and can reveal the complete retained field; equality checks always use the complete raw strings.

## Backend verification

The real SQL migration harness constructs a shared assessment dependency diamond, retains an observation, ingests a changed capture of the same article, appends a replacement assessment, and retains a second observation. The comparison verifies the original and new text, shared article identity, separate identities despite a common outlet, selected assessment context still referring only to the original capture, and the backend's stale flag. The original observation remains byte-equivalent and browser database roles remain denied.

This batch adds no migration, endpoint, privilege, production fixture or worker. The existing immutable observation contract already contains the required inputs and dependency context. It does not implement source-origin withdrawal reassessment, semantic claim reconciliation or spatial projection.

## Validation and next step

Frontend tests cover exact positions, identity separation, missing fields, Unicode/whitespace, context deduplication, unavailable history, disclosure reset and pagination. The existing source-check component test now imports its compiled module through a file URL so it also runs on Windows.

The local production build passes with existing bundle-size and mixed-import warnings. Visual checks use synthetic saved data and the real private workspace component; the full development app preview exceeded local memory, so the component preview excludes the globe engine. Desktop and phone source comparisons were inspected with expanded summary text and assessment reasoning. The GitHub PR checks provide the full Linux suite and release build gate.

Next ready work: connect retained source changes to reviewed claim-level meaning and confirmed derivation records, preserving independent origins as unresolved until evidence supports them. Continue shared Graph, Timeline and World View work only against eligible projections; do not expose private source history through a public node.
