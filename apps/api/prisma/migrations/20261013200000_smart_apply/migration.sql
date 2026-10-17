-- Smart Apply (ADR-0020): submission workflow, attempts, settings and reusable answers.
-- Additive only: new tables, enums, enum values and nullable/defaulted columns; safe on a
-- live database.

-- CreateEnum
CREATE TYPE "SmartApplyState" AS ENUM ('DISCOVERED', 'PREPARING', 'NEEDS_USER_INPUT', 'READY_FOR_REVIEW', 'AWAITING_USER_SUBMISSION', 'SUBMITTING', 'SUBMITTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubmissionMethod" AS ENUM ('PROVIDER_INTEGRATION', 'USER_HANDOFF');

-- CreateEnum
CREATE TYPE "SubmissionConfirmation" AS ENUM ('PROVIDER_CONFIRMED', 'USER_REPORTED');

-- CreateEnum
CREATE TYPE "SubmissionAttemptOutcome" AS ENUM ('PENDING', 'CONFIRMED', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "SmartApplyMode" AS ENUM ('PREPARE_ONLY', 'HYBRID');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SMART_APPLY_INPUT_NEEDED';
ALTER TYPE "NotificationType" ADD VALUE 'SMART_APPLY_SUBMISSION_UPDATE';

-- AlterTable
ALTER TABLE "application_questions" ADD COLUMN     "external_key" TEXT,
ADD COLUMN     "is_required" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "prefilled_from" TEXT,
ADD COLUMN     "profile_answer_id" UUID,
ADD COLUMN     "sensitivity" TEXT NOT NULL DEFAULT 'STANDARD';

-- CreateTable
CREATE TABLE "smart_applications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "state" "SmartApplyState" NOT NULL DEFAULT 'DISCOVERED',
    "source_key" TEXT,
    "source_job_id" TEXT,
    "official_application_url" TEXT,
    "application_url_kind" TEXT,
    "provider_key" TEXT,
    "submission_method" "SubmissionMethod",
    "confirmation" "SubmissionConfirmation",
    "confirmation_reference" TEXT,
    "idempotency_key" TEXT,
    "needs_reconciliation" BOOLEAN NOT NULL DEFAULT false,
    "failure_reason" TEXT,
    "prepared_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "smart_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_apply_events" (
    "id" UUID NOT NULL,
    "smart_application_id" UUID NOT NULL,
    "from_state" "SmartApplyState",
    "to_state" "SmartApplyState" NOT NULL,
    "actor" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smart_apply_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_attempts" (
    "id" UUID NOT NULL,
    "smart_application_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "provider_key" TEXT NOT NULL,
    "outcome" "SubmissionAttemptOutcome" NOT NULL DEFAULT 'PENDING',
    "provider_reference" TEXT,
    "http_status" INTEGER,
    "message" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "next_attempt_at" TIMESTAMPTZ(3),

    CONSTRAINT "submission_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_apply_settings" (
    "user_id" UUID NOT NULL,
    "mode" "SmartApplyMode" NOT NULL DEFAULT 'PREPARE_ONLY',
    "daily_application_limit" INTEGER NOT NULL DEFAULT 10,
    "daily_submission_limit" INTEGER NOT NULL DEFAULT 3,
    "auto_submit_consent_at" TIMESTAMPTZ(3),
    "consent_version" TEXT,
    "notify_input_needed" BOOLEAN NOT NULL DEFAULT true,
    "notify_submission" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "smart_apply_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "profile_answers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "answer_key" TEXT NOT NULL,
    "question_type" "QuestionType" NOT NULL,
    "label" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sensitivity" TEXT NOT NULL DEFAULT 'STANDARD',
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL,
    "valid_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profile_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "smart_applications_application_id_key" ON "smart_applications"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "smart_applications_idempotency_key_key" ON "smart_applications"("idempotency_key");

-- CreateIndex
CREATE INDEX "smart_applications_user_id_state_updated_at_idx" ON "smart_applications"("user_id", "state", "updated_at");

-- CreateIndex
CREATE INDEX "smart_applications_state_needs_reconciliation_idx" ON "smart_applications"("state", "needs_reconciliation");

-- CreateIndex
CREATE UNIQUE INDEX "smart_applications_user_id_job_id_key" ON "smart_applications"("user_id", "job_id");

-- CreateIndex
CREATE INDEX "smart_apply_events_smart_application_id_created_at_idx" ON "smart_apply_events"("smart_application_id", "created_at");

-- CreateIndex
CREATE INDEX "submission_attempts_user_id_started_at_idx" ON "submission_attempts"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "submission_attempts_outcome_next_attempt_at_idx" ON "submission_attempts"("outcome", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "submission_attempts_smart_application_id_attempt_number_key" ON "submission_attempts"("smart_application_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "profile_answers_user_id_answer_key_key" ON "profile_answers"("user_id", "answer_key");

-- CreateIndex
CREATE UNIQUE INDEX "application_questions_application_id_external_key_key" ON "application_questions"("application_id", "external_key");

-- AddForeignKey
ALTER TABLE "application_questions" ADD CONSTRAINT "application_questions_profile_answer_id_fkey" FOREIGN KEY ("profile_answer_id") REFERENCES "profile_answers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_applications" ADD CONSTRAINT "smart_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_applications" ADD CONSTRAINT "smart_applications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_apply_events" ADD CONSTRAINT "smart_apply_events_smart_application_id_fkey" FOREIGN KEY ("smart_application_id") REFERENCES "smart_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attempts" ADD CONSTRAINT "submission_attempts_smart_application_id_fkey" FOREIGN KEY ("smart_application_id") REFERENCES "smart_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_apply_settings" ADD CONSTRAINT "smart_apply_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_answers" ADD CONSTRAINT "profile_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
