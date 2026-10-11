-- CreateEnum
CREATE TYPE "JobOrigin" AS ENUM ('MANUAL', 'DISCOVERED');

-- CreateEnum
CREATE TYPE "RemotePreference" AS ENUM ('ANY', 'REMOTE', 'HYBRID', 'ONSITE');

-- CreateEnum
CREATE TYPE "AlertScheduleType" AS ENUM ('DAILY', 'WEEKLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AlertResumeMode" AS ENUM ('BEST_MATCH', 'DEFAULT_RESUME');

-- CreateEnum
CREATE TYPE "JobSearchTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "JobSearchRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "JobSourceKind" AS ENUM ('DEVELOPMENT', 'API', 'FEED');

-- CreateEnum
CREATE TYPE "DiscoveryOutcome" AS ENUM ('RECOMMENDED', 'BELOW_THRESHOLD', 'DUPLICATE', 'ANALYSIS_FAILED');

-- CreateEnum
CREATE TYPE "JobRecommendationStatus" AS ENUM ('NEW', 'VIEWED', 'DISMISSED', 'SAVED', 'APPLIED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_RECOMMENDATIONS', 'ALERT_RUN_FAILED');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "in_library" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_sample_data" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" "JobOrigin" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "job_search_alerts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "remote_preference" "RemotePreference" NOT NULL DEFAULT 'ANY',
    "employment_types" "EmploymentType"[] DEFAULT ARRAY[]::"EmploymentType"[],
    "experience_level" "SeniorityLevel",
    "minimum_match_score" INTEGER NOT NULL DEFAULT 70,
    "selected_resume_mode" "AlertResumeMode" NOT NULL DEFAULT 'BEST_MATCH',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "schedule_type" "AlertScheduleType" NOT NULL DEFAULT 'DAILY',
    "schedule_time" TEXT NOT NULL DEFAULT '08:00',
    "schedule_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "last_run_at" TIMESTAMPTZ(3),
    "next_run_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_search_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_sources" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "JobSourceKind" NOT NULL,
    "is_development" BOOLEAN NOT NULL,
    "is_enabled" BOOLEAN NOT NULL,
    "description" TEXT,
    "last_success_at" TIMESTAMPTZ(3),
    "last_failure_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovered_jobs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "alert_id" UUID,
    "job_id" UUID,
    "source_url" TEXT,
    "canonical_url" TEXT,
    "dedup_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "location" TEXT,
    "work_mode" "WorkMode",
    "posted_at" TIMESTAMPTZ(3),
    "outcome" "DiscoveryOutcome" NOT NULL,
    "screening_score" INTEGER,
    "discovered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovered_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_search_runs" (
    "id" UUID NOT NULL,
    "alert_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "trigger" "JobSearchTrigger" NOT NULL,
    "status" "JobSearchRunStatus" NOT NULL DEFAULT 'RUNNING',
    "jobs_found" INTEGER NOT NULL DEFAULT 0,
    "jobs_created" INTEGER NOT NULL DEFAULT 0,
    "jobs_skipped" INTEGER NOT NULL DEFAULT 0,
    "below_threshold" INTEGER NOT NULL DEFAULT 0,
    "recommendations_created" INTEGER NOT NULL DEFAULT 0,
    "source_results" JSONB,
    "error_message" TEXT,
    "note" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "job_search_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_recommendations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "alert_id" UUID,
    "run_id" UUID,
    "discovered_job_id" UUID,
    "match_score" INTEGER NOT NULL,
    "recommended_resume_version_id" UUID,
    "resume_id" UUID,
    "resume_name" TEXT,
    "version_number" INTEGER,
    "rank" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gaps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required_skills_matched" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required_skills_missing" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "JobRecommendationStatus" NOT NULL DEFAULT 'NEW',
    "viewed_at" TIMESTAMPTZ(3),
    "saved_at" TIMESTAMPTZ(3),
    "dismissed_at" TIMESTAMPTZ(3),
    "applied_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "data" JSONB,
    "dedup_key" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_search_alerts_user_id_created_at_idx" ON "job_search_alerts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "job_search_alerts_is_active_next_run_at_idx" ON "job_search_alerts"("is_active", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_search_alerts_id_user_id_key" ON "job_search_alerts"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_sources_key_key" ON "job_sources"("key");

-- CreateIndex
CREATE INDEX "discovered_jobs_user_id_canonical_url_idx" ON "discovered_jobs"("user_id", "canonical_url");

-- CreateIndex
CREATE INDEX "discovered_jobs_user_id_dedup_key_idx" ON "discovered_jobs"("user_id", "dedup_key");

-- CreateIndex
CREATE INDEX "discovered_jobs_job_id_idx" ON "discovered_jobs"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "discovered_jobs_user_id_source_id_external_id_key" ON "discovered_jobs"("user_id", "source_id", "external_id");

-- CreateIndex
CREATE INDEX "job_search_runs_alert_id_started_at_idx" ON "job_search_runs"("alert_id", "started_at");

-- CreateIndex
CREATE INDEX "job_search_runs_status_idx" ON "job_search_runs"("status");

-- CreateIndex
CREATE INDEX "job_recommendations_user_id_status_rank_idx" ON "job_recommendations"("user_id", "status", "rank");

-- CreateIndex
CREATE INDEX "job_recommendations_alert_id_idx" ON "job_recommendations"("alert_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_recommendations_user_id_job_id_key" ON "job_recommendations"("user_id", "job_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedup_key_key" ON "notifications"("user_id", "dedup_key");

-- AddForeignKey
ALTER TABLE "job_search_alerts" ADD CONSTRAINT "job_search_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovered_jobs" ADD CONSTRAINT "discovered_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovered_jobs" ADD CONSTRAINT "discovered_jobs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "job_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovered_jobs" ADD CONSTRAINT "discovered_jobs_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "job_search_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovered_jobs" ADD CONSTRAINT "discovered_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_search_runs" ADD CONSTRAINT "job_search_runs_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "job_search_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_search_runs" ADD CONSTRAINT "job_search_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_recommendations" ADD CONSTRAINT "job_recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_recommendations" ADD CONSTRAINT "job_recommendations_job_id_user_id_fkey" FOREIGN KEY ("job_id", "user_id") REFERENCES "jobs"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_recommendations" ADD CONSTRAINT "job_recommendations_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "job_search_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_recommendations" ADD CONSTRAINT "job_recommendations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "job_search_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_recommendations" ADD CONSTRAINT "job_recommendations_discovered_job_id_fkey" FOREIGN KEY ("discovered_job_id") REFERENCES "discovered_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_recommendations" ADD CONSTRAINT "job_recommendations_recommended_resume_version_id_fkey" FOREIGN KEY ("recommended_resume_version_id") REFERENCES "resume_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

