-- concrete_results is append-only: a retest inserts a new row and the latest
-- row per age is the current answer. Same mechanism and rationale as
-- 20260809190935_enforce_append_only.
REVOKE UPDATE, DELETE ON "concrete_results" FROM "buildguard";
