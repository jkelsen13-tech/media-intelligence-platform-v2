# collector-shadow

Private qik collector cutover probe. It fetches one source from the retained
yhb registry snapshot, computes bounded network/content metadata, and appends an
immutable receipt. It cannot write canonical articles, evidence, graph,
publication, or predecessor acknowledgement state.

The function is deployed with gateway JWT verification disabled because the
database-generated, Vault-held `x-mip-collector-shadow-token` is its explicit
custom authentication boundary. The token is never stored in source or
returned by the function. No schedule is created by the migration.
