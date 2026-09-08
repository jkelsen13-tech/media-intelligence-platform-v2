# Private investigation to public surface handoff

Live verification found that selecting Graph directly from the private NASA workspace retained an empty public subject, producing “No canonical subject.” The private workspace and public navigation previously used separate identities until the explicit matching-record button was clicked.

Graph/Timeline/World View navigation from a ready private workspace now resolves the exact subject ID against already loaded Supabase public nodes. It commits that public node once through the existing subject propagation path, then ordinary public tab changes preserve it. It clears stale prior-subject overlays. A missing/unauthorized/unloaded public match stays empty instead of casting private graph_node metadata to an event or retaining an unrelated public subject.

A saved-investigation context notice retains the question and revision with a return button. It explicitly identifies these views as current eligible public records, not the immutable saved snapshot. The private selected version and review state remain in memory; this handoff neither publishes private evidence nor marks it reviewed. The notice disappears on changed user, version or public subject.

Tests cover exact public matching, graph-node-to-event authority from the public node, all three view transitions, private question exclusion from public context and user/version/subject mismatch. Live verification follows CI and deployment.
