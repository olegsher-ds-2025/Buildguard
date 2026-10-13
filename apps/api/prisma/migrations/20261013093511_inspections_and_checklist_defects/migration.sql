-- CreateEnum
CREATE TYPE "DefectSource" AS ENUM ('ai_vision', 'checklist', 'manual');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('open', 'completed');

-- CreateEnum
CREATE TYPE "InspectionOutcome" AS ENUM ('ok', 'fail', 'na');

-- DropForeignKey
ALTER TABLE "defects" DROP CONSTRAINT "defects_detection_id_fkey";

-- AlterTable
ALTER TABLE "defects" ADD COLUMN     "inspection_result_id" TEXT,
ADD COLUMN     "phase_id" TEXT,
ADD COLUMN     "source" "DefectSource" NOT NULL DEFAULT 'ai_vision',
ALTER COLUMN "detection_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "phase_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "inspector_user_id" TEXT NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'open',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_results" (
    "id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "checklist_item_id" TEXT NOT NULL,
    "outcome" "InspectionOutcome" NOT NULL,
    "numeric_value" DECIMAL(12,3),
    "out_of_threshold" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "defect_id" TEXT,
    "supersedes_result_id" TEXT,
    "recorded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspections_project_id_started_at_idx" ON "inspections"("project_id", "started_at");

-- CreateIndex
CREATE INDEX "inspection_results_inspection_id_checklist_item_id_created__idx" ON "inspection_results"("inspection_id", "checklist_item_id", "created_at");

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_detection_id_fkey" FOREIGN KEY ("detection_id") REFERENCES "detections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_user_id_fkey" FOREIGN KEY ("inspector_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_results" ADD CONSTRAINT "inspection_results_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_results" ADD CONSTRAINT "inspection_results_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "checklist_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_results" ADD CONSTRAINT "inspection_results_defect_id_fkey" FOREIGN KEY ("defect_id") REFERENCES "defects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_results" ADD CONSTRAINT "inspection_results_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
