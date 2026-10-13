-- hold_point_events is append-only: signing, bypassing and reopening a hold
-- point each insert a row; the current state is the latest one. Same mechanism
-- and rationale as 20260809190935_enforce_append_only.
REVOKE UPDATE, DELETE ON "hold_point_events" FROM "buildguard";
