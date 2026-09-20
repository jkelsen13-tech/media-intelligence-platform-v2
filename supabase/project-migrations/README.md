# Project-specific live migration records

These files preserve exact SQL already recorded by Supabase on named legacy
projects. They are not part of the canonical migration stream and must not be
bulk-applied to another project. Each directory name is the target project ref.

The separation matters during consolidation: a hardening repair on a retained
source is evidence and rollback history, not automatically a destination schema
requirement.
