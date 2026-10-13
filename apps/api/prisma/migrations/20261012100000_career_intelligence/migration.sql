-- CreateEnum
CREATE TYPE "RejectionCategory" AS ENUM ('SKILLS_MISMATCH', 'EXPERIENCE_LEVEL', 'POSITION_FILLED', 'LOCATION_OR_WORK_MODE', 'COMPENSATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CareerInsightCategory" AS ENUM ('STRENGTH', 'WEAKNESS', 'OPPORTUNITY', 'RISK', 'RECOMMENDATION', 'SKILL_PRIORITY', 'RESUME_RECOMMENDATION', 'TARGETING_RECOMMENDATION', 'INTERVIEW_PREPARATION');

-- CreateEnum
CREATE TYPE "InsightConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CareerInsightRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApplicationStatus" ADD VALUE 'TECHNICAL_INTERVIEW';
ALTER TYPE "ApplicationStatus" ADD VALUE 'ACCEPTED';

-- AlterTable
ALTER TABLE "application_status_history" ADD COLUMN     "occurred_on" DATE;

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "offer_details" TEXT,
ADD COLUMN     "rejection_category" "RejectionCategory";

-- CreateTable
CREATE TABLE "career_insight_runs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "CareerInsightRunStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" TEXT NOT NULL,
    "source" "GenerationSource",
    "provider" TEXT,
    "model" TEXT,
    "data_fingerprint" CHAR(64) NOT NULL,
    "analytics_version" TEXT NOT NULL,
    "applications_analysed" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "error" TEXT,
    "generated_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "career_insight_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_insights" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "category" "CareerInsightCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "evidence_refs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" "InsightConfidence" NOT NULL,
    "recommended_action" TEXT NOT NULL,
    "source_type" "GenerationSource" NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "career_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "career_insight_runs_user_id_created_at_idx" ON "career_insight_runs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "career_insight_runs_status_idx" ON "career_insight_runs"("status");

-- CreateIndex
CREATE INDEX "career_insights_user_id_category_generated_at_idx" ON "career_insights"("user_id", "category", "generated_at");

-- CreateIndex
CREATE INDEX "career_insights_run_id_sort_order_idx" ON "career_insights"("run_id", "sort_order");

-- AddForeignKey
ALTER TABLE "career_insight_runs" ADD CONSTRAINT "career_insight_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_insights" ADD CONSTRAINT "career_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_insights" ADD CONSTRAINT "career_insights_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "career_insight_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

