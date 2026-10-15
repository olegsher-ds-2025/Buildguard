-- CreateEnum
CREATE TYPE "lead_kind" AS ENUM ('register', 'contact');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('new', 'contacted', 'qualified', 'converted', 'closed', 'spam');

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "kind" "lead_kind" NOT NULL,
    "status" "lead_status" NOT NULL DEFAULT 'new',
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "role" TEXT,
    "project_count" INTEGER,
    "project_stage" TEXT,
    "region" TEXT,
    "company" TEXT,
    "topic" TEXT,
    "message" TEXT,
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "referrer" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_term" TEXT,
    "utm_content" TEXT,
    "staff_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE INDEX "leads_email_kind_created_at_idx" ON "leads"("email", "kind", "created_at");
