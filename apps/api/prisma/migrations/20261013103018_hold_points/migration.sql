-- CreateEnum
CREATE TYPE "HoldPointEventKind" AS ENUM ('signed', 'bypassed', 'reopened');

-- CreateTable
CREATE TABLE "hold_points" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "phase_id" TEXT NOT NULL,
    "source_hold_point_id" TEXT,
    "text" TEXT NOT NULL,
    "sub_stage" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hold_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hold_point_events" (
    "id" TEXT NOT NULL,
    "hold_point_id" TEXT NOT NULL,
    "kind" "HoldPointEventKind" NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "signer_name" TEXT,
    "signer_capacity" TEXT,
    "reason" TEXT,
    "photo_id" TEXT,
    "document_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hold_point_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hold_points_project_id_phase_id_idx" ON "hold_points"("project_id", "phase_id");

-- CreateIndex
CREATE UNIQUE INDEX "hold_points_phase_id_source_hold_point_id_key" ON "hold_points"("phase_id", "source_hold_point_id");

-- CreateIndex
CREATE INDEX "hold_point_events_hold_point_id_created_at_idx" ON "hold_point_events"("hold_point_id", "created_at");

-- AddForeignKey
ALTER TABLE "hold_points" ADD CONSTRAINT "hold_points_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hold_points" ADD CONSTRAINT "hold_points_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hold_point_events" ADD CONSTRAINT "hold_point_events_hold_point_id_fkey" FOREIGN KEY ("hold_point_id") REFERENCES "hold_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hold_point_events" ADD CONSTRAINT "hold_point_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hold_point_events" ADD CONSTRAINT "hold_point_events_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hold_point_events" ADD CONSTRAINT "hold_point_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
