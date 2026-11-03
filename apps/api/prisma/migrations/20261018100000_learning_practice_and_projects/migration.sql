-- Learn & Prepare interview practice and project challenges (ADR-0023). Additive only: two
-- new tables and one new enum; safe on a live database.

-- CreateEnum
CREATE TYPE "LearningProjectStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "learning_interview_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "feedback" JSONB NOT NULL,
    "correctness_score" DECIMAL(3,1) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_interview_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_project_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "status" "LearningProjectStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "checked_item_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learning_project_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_interview_attempts_user_id_question_id_created_at_idx" ON "learning_interview_attempts"("user_id", "question_id", "created_at");

-- CreateIndex
CREATE INDEX "learning_interview_attempts_user_id_created_at_idx" ON "learning_interview_attempts"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "learning_project_progress_user_id_challenge_id_key" ON "learning_project_progress"("user_id", "challenge_id");

-- AddForeignKey
ALTER TABLE "learning_interview_attempts" ADD CONSTRAINT "learning_interview_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_project_progress" ADD CONSTRAINT "learning_project_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

