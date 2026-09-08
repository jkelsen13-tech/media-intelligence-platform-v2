# Recent navigation storage boundary — 2026-09-08

Package 04 prerequisite backfill: existing recent-history writes previously serialized arbitrary top-level and nested fields from supplied objects. Reads mapped the entire parsed array before applying the eight-item cap.

Snapshots, writes, reads and direct restores now reconstruct only canonical ID/type, parent ID, supported active view, recorded time/range and an allowed sub-object ID. No title, evidence payload or extra nested fields are copied. String bounds reject objects, arrays, controls and oversized values without coercion; existing recorded time strings retain their temporal precision. This is an allowlist, not a secret-content detector or authority check.

The reader rejects serialized inputs over 32,768 characters before JSON parsing. At most eight slots are inspected, regardless of a caller's larger maximum. Invalid slots are discarded without searching the unbounded tail. Malformed/quota-blocked/unavailable storage degrades safely. Existing catalog validation still controls sub-object restoration.

Five regression tests cover nested field removal, malformed data, hard bounds, direct restore and storage failures. The ephemeral anonymous built-app browser preview seeds only its disposable recent-history key, restores the real released NASA public subject to Graph with its selected day, verifies stripped extra fields, and then runs the existing World View/camera/responsive checks. No user auth storage is read or modified by the verifier.

No new dependency, source, backend mutation or provider activation. Exact private-version/camera/layer presets remain pending. POWER and the separate Browserslist candidate remain held under the recorded rights review constraints. This change does not establish ownership or authorize access to any stored identity.
