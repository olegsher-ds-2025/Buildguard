-- Append-only enforcement (design doc §8): a correction is a new row, never
-- a mutation of history. This revokes UPDATE/DELETE on these tables from the
-- role the app connects as, as a database-level backstop behind the
-- application-layer discipline of only ever INSERTing into them.
--
-- Postgres permits an owner to revoke their own ordinary (DML) privileges —
-- this does not affect DDL rights (ALTER/DROP), which are inherent to
-- ownership and unaffected by GRANT/REVOKE, so future schema migrations
-- against these tables are unaffected.
--
-- The role name is hardcoded (not CURRENT_USER): phase 1 runs migrations and
-- app traffic as the same role ("buildguard" — see apps/api/.env.example and
-- infra/docker-compose.yml). If a future migration runner ever runs as a
-- separate, more-privileged role (e.g. a superuser, which bypasses ACLs
-- entirely), a CURRENT_USER-based revoke would silently no-op instead of
-- restricting the actual app role.

REVOKE UPDATE, DELETE ON "invoices" FROM "buildguard";
REVOKE UPDATE, DELETE ON "payments" FROM "buildguard";
REVOKE UPDATE, DELETE ON "plan_versions" FROM "buildguard";
REVOKE UPDATE, DELETE ON "defect_events" FROM "buildguard";
REVOKE UPDATE, DELETE ON "audit_entries" FROM "buildguard";
