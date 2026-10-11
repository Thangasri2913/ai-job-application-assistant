-- Jobs, analysis runs, requirements, deterministic resume/profile matches and
-- recommendations (ADR-0014). Additive: no existing table or row is changed.
-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "JobAnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobRequirementType" AS ENUM ('SKILL', 'EXPERIENCE', 'EDUCATION', 'RESPONSIBILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "JobRequirementImportance" AS ENUM ('REQUIRED', 'PREFERRED');

-- CreateEnum
CREATE TYPE "JobRequirementOrigin" AS ENUM ('EXPLICIT', 'INFERRED');

-- CreateEnum
CREATE TYPE "JobRequirementDetector" AS ENUM ('PARSER', 'AI');

-- CreateEnum
CREATE TYPE "SeniorityLevel" AS ENUM ('INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'PRINCIPAL');

-- CreateEnum
CREATE TYPE "MatchSubjectType" AS ENUM ('RESUME_VERSION', 'PROFILE');

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "normalized_description" TEXT NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "job_url" TEXT,
    "location" TEXT,
    "employment_type" "EmploymentType",
    "source" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(3),
    "selected_resume_version_id" UUID,
    "selected_at" TIMESTAMPTZ(3),
    "current_analysis_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_analyses" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "status" "JobAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "analyzer_version" TEXT NOT NULL,
    "job_content_hash" CHAR(64) NOT NULL,
    "summary" TEXT,
    "ai_summary" TEXT,
    "seniority" "SeniorityLevel",
    "seniority_origin" TEXT,
    "employment_type" "EmploymentType",
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DECIMAL(3,2),
    "ai_status" TEXT NOT NULL DEFAULT 'DISABLED',
    "ai_note" TEXT,
    "ai_provider" TEXT,
    "ai_prompt_version" TEXT,
    "ai_extraction" JSONB,
    "excluded_resumes" JSONB,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_requirements" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "type" "JobRequirementType" NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "importance" "JobRequirementImportance" NOT NULL,
    "origin" "JobRequirementOrigin" NOT NULL,
    "detected_by" "JobRequirementDetector" NOT NULL,
    "evidence" TEXT,
    "min_years" INTEGER,

    CONSTRAINT "job_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_analyses" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject_type" "MatchSubjectType" NOT NULL,
    "subject_key" TEXT NOT NULL,
    "resume_version_id" UUID,
    "resume_id" UUID,
    "resume_name" TEXT,
    "version_number" INTEGER,
    "is_default_resume" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER,
    "overall_score" INTEGER NOT NULL,
    "skill_score" INTEGER,
    "experience_score" INTEGER,
    "responsibility_score" INTEGER,
    "project_score" INTEGER,
    "education_score" INTEGER,
    "keyword_score" INTEGER,
    "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gaps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" JSONB NOT NULL,
    "scoring_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "match_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_recommendations" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "match_analysis_id" UUID NOT NULL,
    "resume_version_id" UUID,
    "score" INTEGER NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gaps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_current_analysis_id_key" ON "jobs"("current_analysis_id");

-- CreateIndex
CREATE INDEX "jobs_user_id_status_created_at_idx" ON "jobs"("user_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_user_id_content_hash_key" ON "jobs"("user_id", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_id_user_id_key" ON "jobs"("id", "user_id");

-- CreateIndex
CREATE INDEX "job_analyses_job_id_created_at_idx" ON "job_analyses"("job_id", "created_at");

-- CreateIndex
CREATE INDEX "job_analyses_status_idx" ON "job_analyses"("status");

-- CreateIndex
CREATE INDEX "job_requirements_analysis_id_sort_order_idx" ON "job_requirements"("analysis_id", "sort_order");

-- CreateIndex
CREATE INDEX "job_requirements_type_normalized_name_idx" ON "job_requirements"("type", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "job_requirements_analysis_id_type_normalized_name_key" ON "job_requirements"("analysis_id", "type", "normalized_name");

-- CreateIndex
CREATE INDEX "match_analyses_job_id_user_id_idx" ON "match_analyses"("job_id", "user_id");

-- CreateIndex
CREATE INDEX "match_analyses_resume_version_id_idx" ON "match_analyses"("resume_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_analyses_analysis_id_subject_key_key" ON "match_analyses"("analysis_id", "subject_key");

-- CreateIndex
CREATE UNIQUE INDEX "resume_recommendations_analysis_id_key" ON "resume_recommendations"("analysis_id");

-- CreateIndex
CREATE UNIQUE INDEX "resume_recommendations_match_analysis_id_key" ON "resume_recommendations"("match_analysis_id");

-- CreateIndex
CREATE INDEX "resume_recommendations_job_id_idx" ON "resume_recommendations"("job_id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_selected_resume_version_id_fkey" FOREIGN KEY ("selected_resume_version_id") REFERENCES "resume_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_current_analysis_id_fkey" FOREIGN KEY ("current_analysis_id") REFERENCES "job_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_analyses" ADD CONSTRAINT "job_analyses_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requirements" ADD CONSTRAINT "job_requirements_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "job_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_analyses" ADD CONSTRAINT "match_analyses_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "job_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_analyses" ADD CONSTRAINT "match_analyses_job_id_user_id_fkey" FOREIGN KEY ("job_id", "user_id") REFERENCES "jobs"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_analyses" ADD CONSTRAINT "match_analyses_resume_version_id_fkey" FOREIGN KEY ("resume_version_id") REFERENCES "resume_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_recommendations" ADD CONSTRAINT "resume_recommendations_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "job_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_recommendations" ADD CONSTRAINT "resume_recommendations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_recommendations" ADD CONSTRAINT "resume_recommendations_match_analysis_id_fkey" FOREIGN KEY ("match_analysis_id") REFERENCES "match_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_recommendations" ADD CONSTRAINT "resume_recommendations_resume_version_id_fkey" FOREIGN KEY ("resume_version_id") REFERENCES "resume_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

