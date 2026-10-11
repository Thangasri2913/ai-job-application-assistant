-- Interview preparation & mock interviews: sessions (exact application/job/resume version),
-- questions, immutable answers and separate evaluations (ADR-0017). Additive.
-- CreateEnum
CREATE TYPE "InterviewSessionType" AS ENUM ('PREPARATION', 'MOCK_INTERVIEW', 'TECHNICAL', 'BEHAVIORAL', 'HR');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('CREATED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "InterviewFocus" AS ENUM ('MIXED', 'TECHNICAL', 'BEHAVIORAL', 'HR');

-- CreateEnum
CREATE TYPE "InterviewDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "InterviewQuestionCategory" AS ENUM ('INTRODUCTION', 'RESUME', 'TECHNICAL', 'PROJECT', 'BEHAVIORAL', 'SITUATIONAL', 'COMPANY', 'ROLE_SPECIFIC', 'HR');

-- CreateTable
CREATE TABLE "interview_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "resume_version_id" UUID NOT NULL,
    "type" "InterviewSessionType" NOT NULL,
    "focus" "InterviewFocus" NOT NULL,
    "difficulty" "InterviewDifficulty" NOT NULL,
    "question_count" INTEGER NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'CREATED',
    "current_index" INTEGER NOT NULL DEFAULT 0,
    "questions_source" "GenerationSource",
    "questions_note" TEXT,
    "overall_score" INTEGER,
    "report" JSONB,
    "busy_operation" TEXT,
    "busy_since" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_questions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "category" "InterviewQuestionCategory" NOT NULL,
    "difficulty" "InterviewDifficulty" NOT NULL,
    "expected_topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rationale" TEXT,
    "source" "GenerationSource" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_answers" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "answer" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_evaluations" (
    "id" UUID NOT NULL,
    "answer_id" UUID NOT NULL,
    "source" "GenerationSource" NOT NULL,
    "overall_score" DECIMAL(3,1) NOT NULL,
    "dimensions" JSONB NOT NULL,
    "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "improvements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "star" JSONB,
    "technical" JSONB,
    "feedback" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_sessions_user_id_created_at_idx" ON "interview_sessions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "interview_sessions_application_id_created_at_idx" ON "interview_sessions"("application_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "interview_questions_session_id_order_key" ON "interview_questions"("session_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "interview_answers_question_id_attempt_key" ON "interview_answers"("question_id", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "interview_evaluations_answer_id_key" ON "interview_evaluations"("answer_id");

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_resume_version_id_fkey" FOREIGN KEY ("resume_version_id") REFERENCES "resume_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "interview_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluations" ADD CONSTRAINT "interview_evaluations_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "interview_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

