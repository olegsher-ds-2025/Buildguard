-- CreateEnum
CREATE TYPE "ChecklistPhaseKind" AS ENUM ('before', 'during', 'after', 'general');

-- CreateEnum
CREATE TYPE "ChecklistItemType" AS ENUM ('visual', 'measurement', 'lab_test', 'document', 'written_approval');

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" TEXT NOT NULL,
    "stage_no" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "owner_user_id" TEXT,
    "based_on_template_id" TEXT,
    "standards" JSONB NOT NULL DEFAULT '[]',
    "notes" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "sub_stage" TEXT,
    "section" TEXT,
    "phase_kind" "ChecklistPhaseKind" NOT NULL,
    "text" TEXT NOT NULL,
    "standard_ref" TEXT,
    "item_type" "ChecklistItemType" NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "thresholds" JSONB NOT NULL DEFAULT '[]',
    "thresholds_reviewed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_hold_points" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "sub_stage" TEXT,
    "text" TEXT NOT NULL,

    CONSTRAINT "checklist_hold_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "common_defects" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "sub_stage" TEXT,
    "text" TEXT NOT NULL,
    "cost_min_minor" BIGINT,
    "cost_max_minor" BIGINT,

    CONSTRAINT "common_defects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_templates_owner_user_id_stage_no_idx" ON "checklist_templates"("owner_user_id", "stage_no");

-- CreateIndex
CREATE INDEX "checklist_items_template_id_sort_order_idx" ON "checklist_items"("template_id", "sort_order");

-- CreateIndex
CREATE INDEX "checklist_hold_points_template_id_sort_order_idx" ON "checklist_hold_points"("template_id", "sort_order");

-- CreateIndex
CREATE INDEX "common_defects_template_id_idx" ON "common_defects"("template_id");

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_based_on_template_id_fkey" FOREIGN KEY ("based_on_template_id") REFERENCES "checklist_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_hold_points" ADD CONSTRAINT "checklist_hold_points_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "common_defects" ADD CONSTRAINT "common_defects_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
