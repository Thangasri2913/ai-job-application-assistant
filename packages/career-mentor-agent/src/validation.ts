import type {
  MentorRecommendation,
  MentorRecommendationType,
  MentorResponse,
} from '@job-assist/shared';
import { MAX_RECOMMENDATIONS, mentorResponseSchema } from './schemas.js';

/** Resources retrieved by the tools for this request, by recommendation type. */
export class RetrievedResources {
  private readonly ids = new Set<string>();

  add(type: MentorRecommendationType, id: string, courseId: string | null = null): void {
    this.ids.add(RetrievedResources.key(type, id, courseId));
  }

  has(rec: Pick<MentorRecommendation, 'type' | 'id' | 'courseId'>): boolean {
    return this.ids.has(RetrievedResources.key(rec.type, rec.id, rec.courseId));
  }

  private static key(type: MentorRecommendationType, id: string, courseId: string | null) {
    return `${type}|${courseId ?? ''}|${id}`;
  }
}

/**
 * Final check before an answer leaves the agent: recommendations must point at resources the
 * tools retrieved for this request (anything else is dropped), duplicates are removed, and
 * the whole response must match the schema.
 */
export function validateMentorResponse(
  draft: MentorResponse,
  retrieved: RetrievedResources,
): { response: MentorResponse; dropped: number } {
  const seen = new Set<string>();
  const recommendations = draft.recommendations.filter((r) => {
    const key = `${r.type}|${r.courseId ?? ''}|${r.id}`;
    if (seen.has(key) || !retrieved.has(r)) return false;
    seen.add(key);
    return true;
  });
  const dropped = draft.recommendations.length - recommendations.length;
  const response = mentorResponseSchema.parse({
    ...draft,
    recommendations: recommendations.slice(0, MAX_RECOMMENDATIONS),
    proposedActions: draft.proposedActions.slice(0, 3),
    uncertainty: [...new Set(draft.uncertainty)].slice(0, 8),
    factsUsed: draft.factsUsed.slice(0, 12),
  }) as MentorResponse;
  return { response, dropped };
}
