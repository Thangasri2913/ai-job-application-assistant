-- Professional headline (e.g. "Senior Angular Developer") on the career profile and on
-- each resume version's structured content. Nullable, additive: no data is changed.
ALTER TABLE "user_profiles" ADD COLUMN "headline" TEXT;
ALTER TABLE "resume_versions" ADD COLUMN "headline" TEXT;
