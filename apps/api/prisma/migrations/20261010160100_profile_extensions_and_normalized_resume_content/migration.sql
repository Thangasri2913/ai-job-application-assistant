-- Runs as one transaction: schema change + data move succeed or fail together.
BEGIN;

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'INTERNSHIP', 'TEMPORARY');

-- DropIndex
DROP INDEX "certifications_user_id_idx";

-- DropIndex
DROP INDEX "educations_user_id_idx";

-- DropIndex
DROP INDEX "experiences_user_id_start_date_idx";

-- DropIndex
DROP INDEX "projects_user_id_idx";

-- AlterTable
ALTER TABLE "certifications" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "educations" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "experiences" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "resume_versions" ADD COLUMN     "achievements" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_full_name" TEXT,
ADD COLUMN     "contact_github_url" TEXT,
ADD COLUMN     "contact_linkedin_url" TEXT,
ADD COLUMN     "contact_location" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "contact_portfolio_url" TEXT,
ADD COLUMN     "file_id" UUID,
ADD COLUMN     "has_content" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "years_of_experience" DECIMAL(4,1);

-- AlterTable
ALTER TABLE "resumes" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "employment_types" "EmploymentType"[] DEFAULT ARRAY[]::"EmploymentType"[],
ADD COLUMN     "salary_currency" VARCHAR(3),
ADD COLUMN     "salary_max" INTEGER,
ADD COLUMN     "salary_min" INTEGER;

-- CreateTable
CREATE TABLE "profile_languages" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "proficiency" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profile_languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_files" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_version_skills" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "category" "SkillCategory" NOT NULL,

    CONSTRAINT "resume_version_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_version_experiences" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "company" TEXT,
    "job_title" TEXT,
    "location" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "achievements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "resume_version_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_version_educations" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "institution" TEXT,
    "degree" TEXT,
    "field_of_study" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "grade" TEXT,

    CONSTRAINT "resume_version_educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_version_projects" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "url" TEXT,

    CONSTRAINT "resume_version_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_version_certifications" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "date" DATE,

    CONSTRAINT "resume_version_certifications_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE UNIQUE INDEX "profile_languages_user_id_normalized_name_key" ON "profile_languages"("user_id", "normalized_name");

-- CreateIndex
CREATE INDEX "achievements_user_id_sort_order_idx" ON "achievements"("user_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "resume_files_storage_key_key" ON "resume_files"("storage_key");

-- CreateIndex
CREATE INDEX "resume_files_user_id_idx" ON "resume_files"("user_id");

-- CreateIndex
CREATE INDEX "resume_version_skills_normalized_name_idx" ON "resume_version_skills"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "resume_version_skills_version_id_normalized_name_key" ON "resume_version_skills"("version_id", "normalized_name");

-- CreateIndex
CREATE INDEX "resume_version_experiences_version_id_sort_order_idx" ON "resume_version_experiences"("version_id", "sort_order");

-- CreateIndex
CREATE INDEX "resume_version_educations_version_id_sort_order_idx" ON "resume_version_educations"("version_id", "sort_order");

-- CreateIndex
CREATE INDEX "resume_version_projects_version_id_sort_order_idx" ON "resume_version_projects"("version_id", "sort_order");

-- CreateIndex
CREATE INDEX "resume_version_certifications_version_id_sort_order_idx" ON "resume_version_certifications"("version_id", "sort_order");

-- CreateIndex
CREATE INDEX "certifications_user_id_sort_order_idx" ON "certifications"("user_id", "sort_order");

-- CreateIndex
CREATE INDEX "educations_user_id_sort_order_idx" ON "educations"("user_id", "sort_order");

-- CreateIndex
CREATE INDEX "experiences_user_id_sort_order_idx" ON "experiences"("user_id", "sort_order");

-- CreateIndex
CREATE INDEX "projects_user_id_sort_order_idx" ON "projects"("user_id", "sort_order");

-- CreateIndex
CREATE INDEX "resume_versions_file_id_idx" ON "resume_versions"("file_id");

-- ─── Data migration (preserves existing data) ────────────────────────────────

-- Salary: the single expected amount becomes the minimum.
UPDATE "user_profiles"
SET "salary_min" = "expected_salary_amount", "salary_currency" = "expected_salary_currency";

-- Original files: one row per stored object (versions of a resume may share one).
INSERT INTO "resume_files" ("id", "user_id", "storage_key", "original_filename", "mime_type", "size_bytes", "sha256", "created_at")
SELECT DISTINCT ON (v."storage_key")
  gen_random_uuid(), r."user_id", v."storage_key", v."original_filename", v."mime_type", v."file_size_bytes", v."file_sha256", v."created_at"
FROM "resume_versions" v
JOIN "resumes" r ON r."id" = v."resume_id"
WHERE v."storage_key" IS NOT NULL
ORDER BY v."storage_key", v."created_at";

UPDATE "resume_versions" v SET "file_id" = f."id" FROM "resume_files" f WHERE f."storage_key" = v."storage_key";

-- Structured content: JSON document → normalised columns/rows.
UPDATE "resume_versions" SET
  "has_content" = TRUE,
  "contact_full_name" = "content"->'contact'->>'fullName',
  "contact_email" = "content"->'contact'->>'email',
  "contact_phone" = "content"->'contact'->>'phone',
  "contact_location" = "content"->'contact'->>'location',
  "contact_linkedin_url" = "content"->'contact'->>'linkedinUrl',
  "contact_github_url" = "content"->'contact'->>'githubUrl',
  "contact_portfolio_url" = "content"->'contact'->>'portfolioUrl',
  "summary" = "content"->>'summary',
  "years_of_experience" = ("content"->>'estimatedYearsOfExperience')::numeric,
  "achievements" = ARRAY(SELECT jsonb_array_elements_text(COALESCE("content"->'achievements', '[]'::jsonb)))
WHERE "content" IS NOT NULL AND jsonb_typeof("content") = 'object';

INSERT INTO "resume_version_skills" ("id", "version_id", "sort_order", "name", "normalized_name", "category")
SELECT gen_random_uuid(), v."id", (s.ord - 1)::int, s.val->>'name',
  lower(regexp_replace(trim(s.val->>'name'), '\s+', ' ', 'g')), (s.val->>'category')::"SkillCategory"
FROM "resume_versions" v, jsonb_array_elements(v."content"->'skills') WITH ORDINALITY AS s(val, ord)
WHERE v."has_content"
ON CONFLICT ("version_id", "normalized_name") DO NOTHING;

INSERT INTO "resume_version_experiences" ("id", "version_id", "sort_order", "company", "job_title", "location", "start_date", "end_date", "is_current", "responsibilities", "achievements", "technologies")
SELECT gen_random_uuid(), v."id", (e.ord - 1)::int, e.val->>'company', e.val->>'jobTitle', e.val->>'location',
  (e.val->>'startDate')::date, (e.val->>'endDate')::date, COALESCE((e.val->>'isCurrent')::boolean, FALSE),
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(e.val->'responsibilities', '[]'::jsonb))),
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(e.val->'achievements', '[]'::jsonb))),
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(e.val->'technologies', '[]'::jsonb)))
FROM "resume_versions" v, jsonb_array_elements(v."content"->'experiences') WITH ORDINALITY AS e(val, ord)
WHERE v."has_content";

INSERT INTO "resume_version_educations" ("id", "version_id", "sort_order", "institution", "degree", "field_of_study", "start_date", "end_date", "grade")
SELECT gen_random_uuid(), v."id", (e.ord - 1)::int, e.val->>'institution', e.val->>'degree', e.val->>'fieldOfStudy',
  (e.val->>'startDate')::date, (e.val->>'endDate')::date, e.val->>'grade'
FROM "resume_versions" v, jsonb_array_elements(v."content"->'educations') WITH ORDINALITY AS e(val, ord)
WHERE v."has_content";

INSERT INTO "resume_version_projects" ("id", "version_id", "sort_order", "name", "description", "technologies", "highlights", "url")
SELECT gen_random_uuid(), v."id", (p.ord - 1)::int, p.val->>'name', p.val->>'description',
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(p.val->'technologies', '[]'::jsonb))),
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(p.val->'highlights', '[]'::jsonb))),
  p.val->>'url'
FROM "resume_versions" v, jsonb_array_elements(v."content"->'projects') WITH ORDINALITY AS p(val, ord)
WHERE v."has_content";

INSERT INTO "resume_version_certifications" ("id", "version_id", "sort_order", "name", "issuer", "date")
SELECT gen_random_uuid(), v."id", (c.ord - 1)::int, c.val->>'name', c.val->>'issuer', (c.val->>'date')::date
FROM "resume_versions" v, jsonb_array_elements(v."content"->'certifications') WITH ORDINALITY AS c(val, ord)
WHERE v."has_content";

-- Parsed but never confirmed by the user → waiting for review.
UPDATE "resume_versions" SET "parse_status" = 'NEEDS_REVIEW'
WHERE "parse_status" = 'COMPLETED' AND "content_confirmed_at" IS NULL;

-- ─── Remove superseded columns ───────────────────────────────────────────────
ALTER TABLE "resume_versions"
  DROP COLUMN "content",
  DROP COLUMN "file_sha256",
  DROP COLUMN "file_size_bytes",
  DROP COLUMN "mime_type",
  DROP COLUMN "original_filename",
  DROP COLUMN "storage_key";

ALTER TABLE "user_profiles"
  DROP COLUMN "expected_salary_amount",
  DROP COLUMN "expected_salary_currency";

-- AddForeignKey
ALTER TABLE "profile_languages" ADD CONSTRAINT "profile_languages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_files" ADD CONSTRAINT "resume_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "resume_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_version_skills" ADD CONSTRAINT "resume_version_skills_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "resume_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_version_experiences" ADD CONSTRAINT "resume_version_experiences_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "resume_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_version_educations" ADD CONSTRAINT "resume_version_educations_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "resume_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_version_projects" ADD CONSTRAINT "resume_version_projects_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "resume_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_version_certifications" ADD CONSTRAINT "resume_version_certifications_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "resume_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
