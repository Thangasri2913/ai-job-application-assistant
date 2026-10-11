-- Separate migration: a new enum value can only be used after it is committed.
ALTER TYPE "ParseStatus" ADD VALUE 'NEEDS_REVIEW' BEFORE 'COMPLETED';
