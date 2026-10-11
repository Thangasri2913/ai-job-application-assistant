-- AI application preparation: preparations (tied to the application's exact resume version),
-- resume suggestions, versioned cover letters, application questions and AI usage (ADR-0016).
-- Additive: no existing table or row is changed.
-- CreateEnum
CREATE TYPE "PreparationStatus" AS ENUM ('NOT_STARTED', 'READY', 'REVIEWED', 'APPROVED');

-- CreateEnum
CREATE TYPE "GenerationSource" AS ENUM ('AI', 'RULES', 'TEMPLATE', 'MANUAL');

-- CreateEnum
CREATE TYPE "SuggestionKind" AS ENUM ('REWRITE', 'REORDER', 'EMPHASIZE', 'GAP');

-- CreateEnum
CREATE TYPE "SuggestionSection" AS ENUM ('SUMMARY', 'EXPERIENCE', 'PROJECT', 'SKILLS', 'EDUCATION', 'CERTIFICATIONS');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EDITED');

-- CreateEnum
CREATE TYPE "CoverLetterStatus" AS ENUM ('GENERATED', 'EDITED', 'APPROVED');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('PENDING', 'GENERATED', 'EDITED', 'APPROVED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MOTIVATION', 'EXPERIENCE', 'SALARY', 'NOTICE_PERIOD', 'WORK_AUTHORIZATION', 'LOCATION', 'OTHER');

-- CreateEnum
CREATE TYPE "AiUsageStatus" AS ENUM ('SUCCEEDED', 'INVALID', 'FAILED');

-- CreateTable
CREATE TABLE "application_preparations" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "resume_version_id" UUID NOT NULL,
    "status" "PreparationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "approved_at" TIMESTAMPTZ(3),
    "busy_operation" TEXT,
    "busy_since" TIMESTAMPTZ(3),
    "suggestions_note" TEXT,
    "suggestions_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "application_preparations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_suggestions" (
    "id" UUID NOT NULL,
    "preparation_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "kind" "SuggestionKind" NOT NULL,
    "section" "SuggestionSection" NOT NULL,
    "original_text" TEXT,
    "suggested_text" TEXT,
    "user_text" TEXT,
    "reason" TEXT NOT NULL,
    "job_requirement" TEXT,
    "confidence" DECIMAL(3,2),
    "source" "GenerationSource" NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "target" JSONB,
    "decided_at" TIMESTAMPTZ(3),
    "superseded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resume_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cover_letter_versions" (
    "id" UUID NOT NULL,
    "preparation_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "source" "GenerationSource" NOT NULL,
    "generated_text" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "CoverLetterStatus" NOT NULL DEFAULT 'GENERATED',
    "note" TEXT,
    "not_claimed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approved_at" TIMESTAMPTZ(3),
    "document_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cover_letter_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_questions" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "question_type" "QuestionType" NOT NULL,
    "max_words" INTEGER,
    "max_characters" INTEGER,
    "suggested_answer" TEXT,
    "answer_source" "GenerationSource",
    "insufficient_information" BOOLEAN NOT NULL DEFAULT false,
    "missing_information" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assumptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "user_answer" TEXT,
    "status" "QuestionStatus" NOT NULL DEFAULT 'PENDING',
    "generated_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "application_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "application_id" UUID,
    "operation" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "status" "AiUsageStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "application_preparations_application_id_key" ON "application_preparations"("application_id");

-- CreateIndex
CREATE INDEX "application_preparations_user_id_idx" ON "application_preparations"("user_id");

-- CreateIndex
CREATE INDEX "resume_suggestions_preparation_id_superseded_at_sort_order_idx" ON "resume_suggestions"("preparation_id", "superseded_at", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "cover_letter_versions_document_id_key" ON "cover_letter_versions"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "cover_letter_versions_preparation_id_version_number_key" ON "cover_letter_versions"("preparation_id", "version_number");

-- CreateIndex
CREATE INDEX "application_questions_application_id_created_at_idx" ON "application_questions"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_user_id_created_at_idx" ON "ai_usage"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_operation_created_at_idx" ON "ai_usage"("operation", "created_at");

-- AddForeignKey
ALTER TABLE "application_preparations" ADD CONSTRAINT "application_preparations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_preparations" ADD CONSTRAINT "application_preparations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_preparations" ADD CONSTRAINT "application_preparations_resume_version_id_fkey" FOREIGN KEY ("resume_version_id") REFERENCES "resume_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_suggestions" ADD CONSTRAINT "resume_suggestions_preparation_id_fkey" FOREIGN KEY ("preparation_id") REFERENCES "application_preparations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_letter_versions" ADD CONSTRAINT "cover_letter_versions_preparation_id_fkey" FOREIGN KEY ("preparation_id") REFERENCES "application_preparations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_letter_versions" ADD CONSTRAINT "cover_letter_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "application_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_questions" ADD CONSTRAINT "application_questions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

