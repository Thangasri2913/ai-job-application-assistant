-- Global real job discovery: provenance of discovered postings and fuller run history.
-- Additive only: new nullable or defaulted columns, safe on a live database.

-- AlterTable
ALTER TABLE "discovered_jobs" ADD COLUMN     "discovered_from" TEXT;

-- AlterTable
ALTER TABLE "job_search_runs" ADD COLUMN     "duplicates" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "jobs_analyzed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "jobs_discovered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "search_strategy" JSONB;
