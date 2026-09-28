-- CreateEnum
CREATE TYPE "tender_status" AS ENUM ('draft', 'published', 'invited_bidding', 'awarded', 'cancelled', 'closed');

-- CreateEnum
CREATE TYPE "tender_invitation_status" AS ENUM ('invited', 'declined', 'bid_submitted');

-- CreateEnum
CREATE TYPE "bid_status" AS ENUM ('submitted', 'withdrawn', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "contract_status" AS ENUM ('draft', 'signed', 'active', 'completed', 'terminated');

-- AlterTable
ALTER TABLE "contractor_profiles" ADD COLUMN     "currently_available" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "work_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_categories" (
    "contractor_profile_id" TEXT NOT NULL,
    "work_category_id" TEXT NOT NULL,

    CONSTRAINT "contractor_categories_pkey" PRIMARY KEY ("contractor_profile_id","work_category_id")
);

-- CreateTable
CREATE TABLE "tenders" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "work_category_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope_description" JSONB NOT NULL,
    "budget_min_minor" BIGINT NOT NULL,
    "budget_max_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "planned_start_date" TIMESTAMP(3),
    "planned_end_date" TIMESTAMP(3),
    "status" "tender_status" NOT NULL DEFAULT 'draft',
    "created_by_user_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_invitations" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "contractor_profile_id" TEXT NOT NULL,
    "match_score" DECIMAL(5,4) NOT NULL,
    "status" "tender_invitation_status" NOT NULL DEFAULT 'invited',
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "tender_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "contractor_profile_id" TEXT NOT NULL,
    "total_amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "proposed_start_date" TIMESTAMP(3),
    "proposed_end_date" TIMESTAMP(3),
    "payment_terms_description" TEXT NOT NULL,
    "status" "bid_status" NOT NULL DEFAULT 'submitted',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMP(3),
    "supersedes_bid_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bid_line_items" (
    "id" TEXT NOT NULL,
    "bid_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "bid_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "contractor_profile_id" TEXT NOT NULL,
    "winning_bid_id" TEXT NOT NULL,
    "total_amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "contract_status" NOT NULL DEFAULT 'draft',
    "signed_at" TIMESTAMP(3),
    "signed_by_owner_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_payment_milestones" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "phase_id" TEXT,
    "sequence_no" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "released_at" TIMESTAMP(3),

    CONSTRAINT "contract_payment_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_categories_name_key" ON "work_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tender_invitations_tender_id_contractor_profile_id_key" ON "tender_invitations"("tender_id", "contractor_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "bids_supersedes_bid_id_key" ON "bids"("supersedes_bid_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_tender_id_key" ON "contracts"("tender_id");

-- AddForeignKey
ALTER TABLE "contractor_categories" ADD CONSTRAINT "contractor_categories_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "contractor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_categories" ADD CONSTRAINT "contractor_categories_work_category_id_fkey" FOREIGN KEY ("work_category_id") REFERENCES "work_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_work_category_id_fkey" FOREIGN KEY ("work_category_id") REFERENCES "work_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_invitations" ADD CONSTRAINT "tender_invitations_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_invitations" ADD CONSTRAINT "tender_invitations_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "contractor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "contractor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_line_items" ADD CONSTRAINT "bid_line_items_bid_id_fkey" FOREIGN KEY ("bid_id") REFERENCES "bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "contractor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_signed_by_owner_user_id_fkey" FOREIGN KEY ("signed_by_owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_milestones" ADD CONSTRAINT "contract_payment_milestones_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
