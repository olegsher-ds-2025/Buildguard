-- CreateEnum
CREATE TYPE "PhotoTag" AS ENUM ('defect', 'inspection', 'approval', 'before_cover', 'after');

-- AlterTable
ALTER TABLE "checklist_items" ADD COLUMN     "requires_before_cover_photo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "tag" "PhotoTag" NOT NULL,
    "phase_id" TEXT,
    "inspection_id" TEXT,
    "checklist_item_id" TEXT,
    "defect_id" TEXT,
    "object_key" TEXT NOT NULL,
    "markup" JSONB NOT NULL DEFAULT '[]',
    "gps_lat" DECIMAL(9,6),
    "gps_lng" DECIMAL(9,6),
    "taken_at" TIMESTAMP(3),
    "uploaded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photos_project_id_tag_idx" ON "photos"("project_id", "tag");

-- CreateIndex
CREATE INDEX "photos_inspection_id_checklist_item_id_idx" ON "photos"("inspection_id", "checklist_item_id");

-- CreateIndex
CREATE INDEX "photos_defect_id_idx" ON "photos"("defect_id");

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_defect_id_fkey" FOREIGN KEY ("defect_id") REFERENCES "defects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Databases seeded before this migration already hold the system templates,
-- which seed-checklists.ts will not touch again; flag the items that document
-- a one-off photo moment (same pattern as extract_checklist.py).
UPDATE "checklist_items" ci
SET "requires_before_cover_photo" = true
FROM "checklist_templates" ct
WHERE ci."template_id" = ct."id"
  AND ct."owner_user_id" IS NULL
  AND ci."text" ~ 'מתועדת בצילום|צילום כל תוואי|תיעוד מצולם';
