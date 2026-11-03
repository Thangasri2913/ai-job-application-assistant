-- Learn & Prepare learner preferences (ADR-0024). Additive only: one new table; safe on a live
-- database.

-- CreateTable
CREATE TABLE "learning_preferences" (
    "user_id" UUID NOT NULL,
    "target_role" TEXT,
    "interest_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interest_skill_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "weekly_goal_minutes" INTEGER,
    "dismissed_steps" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learning_preferences_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "learning_preferences" ADD CONSTRAINT "learning_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

