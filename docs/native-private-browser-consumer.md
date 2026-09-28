# Native private browser consumer — source candidate only

This component is intended for the existing private investigation workspace, with a separate explicit native binding form. The form never derives scope from an investigation, public article, public event, or public arc. All three lowercase values are required: scope UUID, binding UUID, and exact 64-hex manifest hash. No URL selection, automatic read, public-loader handoff, publication, attachment, local cache, or payload persistence is implemented.

The controller uses existing auth.js getSession/onAuthChange and existing Vite qik URL/public API-key readers. It sends only {scope,binding_id,manifest_hash} by POST to the exact qik /functions/v1/native-comparison-display path, with the current bearer and public apikey. It refuses other origins and secret keys. The bearer is never exposed in controller state or rendered. A changed selection, any auth event, expiry, or disposal clears the displayed DTO and aborts pending requests; an epoch also discards late responses when fetch ignores abort. No automatic retry occurs.

The response is the existing bare private DTO, not a {data:...} envelope. Reads are capped at 524288 UTF-8 bytes and 12 seconds. The canonical displayContract.mjs validates nested allowlists and cross-record identities before buildPrivateWorkspace supplies all three private surfaces. The accompanying canonical edit replaces its two Buffer.byteLength calls with one TextEncoder byteLength helper; all validation and exports are preserved, and no duplicate/shadow validator is used.

The render preserves approved source excerpts as text, including whitespace, provenance, claims, explanations, corrections, proposed arc outcomes, and PRIVATE News-record publication dates. Event occurrence remains unverified. Private projection/article/event IDs are labels only and are not passed to public readers. Errors mean unavailable or refused, never a zero-entity or no-record conclusion.

## Integration prerequisites and limits

- Integrate the accompanying canonical displayContract.mjs portability blob with the UI; browser loading depends on that edit.
- The accompanying PrivateInvestigationWorkspace.jsx edit imports and mounts NativePrivateComparisonWorkspace once at its top-level private wrapper, outside the unrelated investigation revealPrivate gate. The component reuses the existing account session and requires its own exact server admission.
- The private server/runtime, gateway credentials/admission, Node-to-Edge packaging and deployment are not ready. This source candidate does not make the endpoint available.
- Existing public Comparison, Timeline and Arcs pages remain on their public read paths.
- tests/nativePrivateUiRead.test.mjs and tests/nativePrivateUiFixture.mjs contain synthetic-only unit coverage. Tests and build have NOT RUN. Browser layout/accessibility and integrated runtime behavior are not verified.
- No secrets, actual private payloads, SQL, auth settings, refs, workflows, or deployments were changed by this UI authoring task.
