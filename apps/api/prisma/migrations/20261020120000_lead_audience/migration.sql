ALTER TABLE "leads"
  ADD COLUMN "audience" TEXT,
  ADD COLUMN "landing_path" TEXT,
  ADD COLUMN "project_kind" TEXT,
  ADD COLUMN "budget_range" TEXT,
  ADD COLUMN "need_contractors" BOOLEAN,
  ADD COLUMN "trades" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "team_size" TEXT;

CREATE INDEX "leads_audience_idx" ON "leads"("audience");
