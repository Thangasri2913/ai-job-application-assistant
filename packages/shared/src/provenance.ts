/**
 * Where a piece of information came from. Every user-visible claim produced or
 * stored by the system must carry one of these so the UI never blurs them together.
 * See docs/AI_ARCHITECTURE.md § Provenance.
 */
export const PROVENANCE_KINDS = [
  /** Entered or uploaded by the user (resume text, profile fields). */
  'USER_FACT',
  /** Stated explicitly by an external source (e.g. the job description text). */
  'EXTERNAL_SOURCE',
  /** Interpreted by the AI from the sources; not stated verbatim. */
  'AI_INFERENCE',
  /** New wording or advice proposed by the AI for the user to accept/edit. */
  'AI_SUGGESTION',
] as const;

export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];
