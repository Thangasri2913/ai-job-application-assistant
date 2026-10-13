import type { Fact, InsightDraft } from './facts.js';

const MAX_INSIGHTS = 8;

/**
 * Rule-based insights (always available, used when AI is off or its output is rejected). Each
 * one restates a computed fact and suggests an action; none claims a guaranteed outcome.
 */
export function ruleInsights(facts: Fact[]): InsightDraft[] {
  const drafts: InsightDraft[] = [];
  const add = (fact: Fact, d: Omit<InsightDraft, 'factIds' | 'confidence'>) =>
    drafts.push({ ...d, factIds: [fact.id], confidence: fact.confidence });

  for (const f of facts) {
    switch (f.kind) {
      case 'STRONGEST_ROLE':
        add(f, {
          category: 'TARGETING_RECOMMENDATION',
          title: 'A role type with stronger response',
          explanation: f.statement,
          recommendedAction:
            'Consider prioritising similar roles, and compare what differs in roles with a lower response.',
        });
        break;
      case 'STRONGEST_RESUME':
        add(f, {
          category: 'RESUME_RECOMMENDATION',
          title: 'A resume version with stronger response',
          explanation: f.statement,
          recommendedAction:
            'Review what this version emphasises and consider using it (or its approach) for similar roles.',
        });
        break;
      case 'STRONGEST_SOURCE':
        add(f, {
          category: 'TARGETING_RECOMMENDATION',
          title: 'A job source with stronger response',
          explanation: f.statement,
          recommendedAction: 'Consider spending more of your search time on this source.',
        });
        break;
      case 'STRONGEST_LOCATION':
      case 'STRONGEST_WORK_MODE':
        add(f, {
          category: 'OPPORTUNITY',
          title:
            f.kind === 'STRONGEST_LOCATION'
              ? 'A location with stronger response'
              : 'A work arrangement with stronger response',
          explanation: f.statement,
          recommendedAction: 'Consider whether to weight your search towards it.',
        });
        break;
      case 'MATCH_OUTCOME_TREND':
        add(f, {
          category: 'OPPORTUNITY',
          title: 'How match score relates to your interviews',
          explanation: f.statement,
          recommendedAction:
            'Use the match score when choosing what to apply to, alongside your own judgement of the role.',
        });
        break;
      case 'MATCH_ALIGNMENT': {
        const share = f.data?.share ?? null;
        const low = share !== null && share < 0.5;
        add(f, {
          category: low ? 'RISK' : 'STRENGTH',
          title: low
            ? 'Many applications go to lower-match jobs'
            : 'Most applications go to well-matched jobs',
          explanation: f.statement,
          recommendedAction: low
            ? 'Check whether these roles fit your experience, or whether a different resume version would present it better.'
            : 'Keep checking the match analysis before applying.',
        });
        break;
      }
      case 'SKILL_GAP':
        add(f, {
          category: 'SKILL_PRIORITY',
          title: `${f.data?.skill ?? 'A skill'} may be worth strengthening`,
          explanation: f.statement,
          recommendedAction: `If you have genuine ${f.data?.skill ?? 'experience with this skill'}, consider highlighting it in the resume you use for these roles. If not, consider whether to build it or to focus on roles that don’t require it.`,
        });
        break;
      case 'SKILL_STRENGTH':
        add(f, {
          category: 'STRENGTH',
          title: `${f.data?.skill ?? 'A skill'} is well covered`,
          explanation: f.statement,
          recommendedAction: 'Keep this evidence prominent in the resumes you use for these roles.',
        });
        break;
      case 'WEAK_TOPIC':
        add(f, {
          category: 'INTERVIEW_PREPARATION',
          title: `Practise ${f.data?.skill ?? 'this topic'} further`,
          explanation: f.statement,
          recommendedAction:
            'Run another practice session focused on this topic and prepare a concrete example from your own experience.',
        });
        break;
      case 'REJECTION_CATEGORIES':
        add(f, {
          category: 'WEAKNESS',
          title: 'A recurring rejection reason',
          explanation: f.statement,
          recommendedAction:
            'Review the roles behind these rejections for a common requirement or mismatch before applying to similar ones.',
        });
        break;
      case 'LIMITATION':
        add(f, {
          category: 'RECOMMENDATION',
          title: 'Record outcomes to unlock patterns',
          explanation: `${f.statement} Counts are shown, but no comparisons are made yet.`,
          recommendedAction:
            'Keep each application’s status up to date (screening, interviews, offers, rejections) as you hear back.',
        });
        break;
      default:
        break;
    }
  }
  return drafts.slice(0, MAX_INSIGHTS);
}
