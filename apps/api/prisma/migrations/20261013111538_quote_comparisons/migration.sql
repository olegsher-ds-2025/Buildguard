-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('uploaded', 'extracted', 'failed');

-- CreateTable
CREATE TABLE "quote_comparisons" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage_no" INTEGER,
    "analysis" JSONB,
    "analyzed_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "comparison_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "supplier_name" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'uploaded',
    "extraction" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_comparisons_project_id_created_at_idx" ON "quote_comparisons"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "quotes_comparison_id_idx" ON "quotes"("comparison_id");

-- AddForeignKey
ALTER TABLE "quote_comparisons" ADD CONSTRAINT "quote_comparisons_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_comparisons" ADD CONSTRAINT "quote_comparisons_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_comparison_id_fkey" FOREIGN KEY ("comparison_id") REFERENCES "quote_comparisons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
