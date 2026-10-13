-- CreateEnum
CREATE TYPE "TimedTestKind" AS ENUM ('pressure', 'flood');

-- CreateEnum
CREATE TYPE "TimedTestOutcome" AS ENUM ('passed', 'failed');

-- CreateTable
CREATE TABLE "concrete_pours" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "phase_id" TEXT,
    "element" TEXT NOT NULL,
    "concrete_grade" TEXT NOT NULL,
    "required_mpa_28" DECIMAL(6,2) NOT NULL,
    "delivery_note" TEXT,
    "slump_cm" DECIMAL(5,1),
    "span_meters" DECIMAL(6,2),
    "cantilever_meters" DECIMAL(6,2),
    "cast_at" TIMESTAMP(3) NOT NULL,
    "formwork_removed_at" TIMESTAMP(3),
    "formwork_removed_by_user_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concrete_pours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concrete_results" (
    "id" TEXT NOT NULL,
    "pour_id" TEXT NOT NULL,
    "age_days" INTEGER NOT NULL,
    "strength_mpa" DECIMAL(6,2) NOT NULL,
    "tested_at" TIMESTAMP(3),
    "note" TEXT,
    "recorded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concrete_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timed_tests" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "phase_id" TEXT,
    "kind" "TimedTestKind" NOT NULL,
    "location" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "duration_hours" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "start_reading" DECIMAL(8,2),
    "end_reading" DECIMAL(8,2),
    "start_photo_id" TEXT,
    "end_photo_id" TEXT,
    "outcome" "TimedTestOutcome",
    "note" TEXT,
    "completed_at" TIMESTAMP(3),
    "started_by_user_id" TEXT NOT NULL,
    "completed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timed_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "concrete_pours_project_id_cast_at_idx" ON "concrete_pours"("project_id", "cast_at");

-- CreateIndex
CREATE INDEX "concrete_results_pour_id_age_days_created_at_idx" ON "concrete_results"("pour_id", "age_days", "created_at");

-- CreateIndex
CREATE INDEX "timed_tests_project_id_started_at_idx" ON "timed_tests"("project_id", "started_at");

-- AddForeignKey
ALTER TABLE "concrete_pours" ADD CONSTRAINT "concrete_pours_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concrete_pours" ADD CONSTRAINT "concrete_pours_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concrete_pours" ADD CONSTRAINT "concrete_pours_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concrete_results" ADD CONSTRAINT "concrete_results_pour_id_fkey" FOREIGN KEY ("pour_id") REFERENCES "concrete_pours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concrete_results" ADD CONSTRAINT "concrete_results_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timed_tests" ADD CONSTRAINT "timed_tests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timed_tests" ADD CONSTRAINT "timed_tests_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timed_tests" ADD CONSTRAINT "timed_tests_started_by_user_id_fkey" FOREIGN KEY ("started_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timed_tests" ADD CONSTRAINT "timed_tests_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
