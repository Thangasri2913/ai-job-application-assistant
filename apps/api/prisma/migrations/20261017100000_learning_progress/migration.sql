-- Learn & Prepare progress (ADR-0022): enrolments, lesson completions, practice attempts,
-- assessments and skill evidence. Additive only: new tables and one new enum; safe on a
-- live database.

-- CreateEnum
CREATE TYPE "LearningAssessmentKind" AS ENUM ('DIAGNOSTIC');

-- CreateTable
CREATE TABLE "learning_enrollments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learning_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_lesson_completions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_lesson_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_activity_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "correct" BOOLEAN,
    "score" DECIMAL(4,3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_activity_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_assessment_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" TEXT NOT NULL,
    "kind" "LearningAssessmentKind" NOT NULL,
    "score" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_assessment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_skill_evidence" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "skill_id" TEXT NOT NULL,
    "assessment_attempt_id" UUID NOT NULL,
    "correct" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_skill_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learning_enrollments_user_id_course_id_key" ON "learning_enrollments"("user_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_lesson_completions_user_id_course_id_lesson_id_key" ON "learning_lesson_completions"("user_id", "course_id", "lesson_id");

-- CreateIndex
CREATE INDEX "learning_activity_attempts_user_id_course_id_created_at_idx" ON "learning_activity_attempts"("user_id", "course_id", "created_at");

-- CreateIndex
CREATE INDEX "learning_assessment_attempts_user_id_course_id_created_at_idx" ON "learning_assessment_attempts"("user_id", "course_id", "created_at");

-- CreateIndex
CREATE INDEX "learning_skill_evidence_user_id_skill_id_created_at_idx" ON "learning_skill_evidence"("user_id", "skill_id", "created_at");

-- CreateIndex
CREATE INDEX "learning_skill_evidence_assessment_attempt_id_idx" ON "learning_skill_evidence"("assessment_attempt_id");

-- AddForeignKey
ALTER TABLE "learning_enrollments" ADD CONSTRAINT "learning_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_lesson_completions" ADD CONSTRAINT "learning_lesson_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_activity_attempts" ADD CONSTRAINT "learning_activity_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_assessment_attempts" ADD CONSTRAINT "learning_assessment_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_skill_evidence" ADD CONSTRAINT "learning_skill_evidence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_skill_evidence" ADD CONSTRAINT "learning_skill_evidence_assessment_attempt_id_fkey" FOREIGN KEY ("assessment_attempt_id") REFERENCES "learning_assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

