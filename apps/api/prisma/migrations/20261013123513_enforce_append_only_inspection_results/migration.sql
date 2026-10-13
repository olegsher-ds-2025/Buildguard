-- inspection_results is append-only: re-marking an item inserts a superseding
-- row. Same mechanism and rationale as 20260809190935_enforce_append_only.
REVOKE UPDATE, DELETE ON "inspection_results" FROM "buildguard";
