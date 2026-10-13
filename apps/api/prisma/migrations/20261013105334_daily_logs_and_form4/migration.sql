-- CreateEnum
CREATE TYPE "DailyLogStatus" AS ENUM ('draft', 'locked');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6);

-- CreateTable
CREATE TABLE "daily_logs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "log_date" DATE NOT NULL,
    "status" "DailyLogStatus" NOT NULL DEFAULT 'draft',
    "weather_code" INTEGER,
    "temperature_c" DECIMAL(4,1),
    "headcount" JSONB NOT NULL DEFAULT '[]',
    "work_done" TEXT NOT NULL DEFAULT '',
    "safety_ok" BOOLEAN,
    "safety_notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "content_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form4_items" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "satisfied" BOOLEAN NOT NULL DEFAULT false,
    "document_id" TEXT,
    "note" TEXT,
    "satisfied_at" TIMESTAMP(3),
    "satisfied_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form4_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_logs_project_id_log_date_key" ON "daily_logs"("project_id", "log_date");

-- CreateIndex
CREATE UNIQUE INDEX "form4_items_project_id_key_key" ON "form4_items"("project_id", "key");

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form4_items" ADD CONSTRAINT "form4_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form4_items" ADD CONSTRAINT "form4_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form4_items" ADD CONSTRAINT "form4_items_satisfied_by_user_id_fkey" FOREIGN KEY ("satisfied_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
