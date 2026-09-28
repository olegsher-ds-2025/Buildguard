-- Append-only enforcement for the Tenders & Contractors module (M8), same
-- rationale as 20260809190935_enforce_append_only: a revised bid is a new
-- row (Bid.supersedesBidId), never a mutation of a submitted offer.
--
-- The role name is hardcoded, not CURRENT_USER, for the same reason
-- documented in the earlier append-only migration.

REVOKE UPDATE, DELETE ON "bids" FROM "buildguard";
REVOKE UPDATE, DELETE ON "bid_line_items" FROM "buildguard";
