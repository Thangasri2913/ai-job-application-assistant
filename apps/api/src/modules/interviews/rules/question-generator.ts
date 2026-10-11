import type {
  InterviewDifficulty,
  InterviewFocus,
  InterviewQuestionCategory,
} from '@job-assist/shared';
import { detectSkills, skillKey } from '../../../common/skills/skill-normalization.js';
import type { PreparationContext } from '../../application-preparation/preparation-context.js';
import {
  BEHAVIORAL_BANK,
  genericTechnical,
  SITUATIONAL_BANK,
  STAR_TOPICS,
  TECHNICAL_BANK,
} from './question-bank.js';

export interface DraftQuestion {
  question: string;
  category: InterviewQuestionCategory;
  difficulty: InterviewDifficulty;
  expectedTopics: string[];
  rationale: string | null;
}

export interface QuestionSettings {
  focus: InterviewFocus;
  difficulty: InterviewDifficulty;
  count: number;
}

const normalize = (q: string) =>
  q
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Category mix (in interview order) and how many of each, per focus. */
const MIX: Record<InterviewFocus, InterviewQuestionCategory[]> = {
  MIXED: [
    'INTRODUCTION',
    'RESUME',
    'TECHNICAL',
    'PROJECT',
    'ROLE_SPECIFIC',
    'TECHNICAL',
    'BEHAVIORAL',
    'TECHNICAL',
    'SITUATIONAL',
    'BEHAVIORAL',
    'TECHNICAL',
    'ROLE_SPECIFIC',
    'COMPANY',
    'BEHAVIORAL',
    'HR',
  ],
  TECHNICAL: [
    'RESUME',
    'TECHNICAL',
    'TECHNICAL',
    'PROJECT',
    'TECHNICAL',
    'ROLE_SPECIFIC',
    'TECHNICAL',
    'TECHNICAL',
    'PROJECT',
    'TECHNICAL',
    'ROLE_SPECIFIC',
    'TECHNICAL',
    'TECHNICAL',
    'SITUATIONAL',
    'TECHNICAL',
  ],
  BEHAVIORAL: [
    'INTRODUCTION',
    'BEHAVIORAL',
    'BEHAVIORAL',
    'SITUATIONAL',
    'BEHAVIORAL',
    'PROJECT',
    'BEHAVIORAL',
    'SITUATIONAL',
    'BEHAVIORAL',
    'BEHAVIORAL',
    'SITUATIONAL',
    'BEHAVIORAL',
    'BEHAVIORAL',
    'COMPANY',
    'BEHAVIORAL',
  ],
  HR: [
    'INTRODUCTION',
    'COMPANY',
    'HR',
    'HR',
    'BEHAVIORAL',
    'HR',
    'RESUME',
    'HR',
    'BEHAVIORAL',
    'HR',
    'SITUATIONAL',
    'HR',
    'BEHAVIORAL',
    'HR',
    'COMPANY',
  ],
};

/**
 * Personalised questions from the job's stored requirements, the match evidence and the
 * resume version — no AI. Questions about missing skills ask openly about them and never
 * presume experience the candidate doesn't have.
 */
export function generateQuestions(
  ctx: PreparationContext,
  settings: QuestionSettings,
): DraftQuestion[] {
  const { content } = ctx.resume;
  const evidence = ctx.match.evidence;
  const d = settings.difficulty;
  const required = ctx.job.requirements.filter(
    (r) => r.type === 'SKILL' && r.importance === 'REQUIRED',
  );
  const preferred = ctx.job.requirements.filter(
    (r) => r.type === 'SKILL' && r.importance === 'PREFERRED',
  );
  const statusOf = new Map(evidence.skills.map((s) => [s.normalizedName, s]));
  const shown = [...required, ...preferred].filter((r) => {
    const s = statusOf.get(r.normalizedName);
    return s && s.status !== 'MISSING';
  });
  const missing = required.filter((r) => statusOf.get(r.normalizedName)?.status === 'MISSING');
  const topSkills = shown.slice(0, 3).map((r) => r.name);

  const pools: Record<InterviewQuestionCategory, DraftQuestion[]> = {
    INTRODUCTION: [
      {
        question: `Tell me about yourself and what draws you to this ${ctx.job.title} role.`,
        category: 'INTRODUCTION',
        difficulty: d,
        expectedTopics: ['current role', ...topSkills, 'motivation'],
        rationale: 'Most interviews open with this.',
      },
    ],
    RESUME: content.experiences.slice(0, 3).map((e) => {
      const role = [e.jobTitle, e.company].filter(Boolean).join(' at ');
      return {
        question: `Walk me through your role as ${role}. What were you responsible for, and what are you proudest of?`,
        category: 'RESUME' as const,
        difficulty: d,
        expectedTopics: ['responsibilities', ...e.technologies.slice(0, 3), 'impact'],
        rationale: `From your resume: ${role}.`,
      };
    }),
    TECHNICAL: [
      ...shown.map((r) => {
        const bank = TECHNICAL_BANK[r.normalizedName]?.[d] ?? genericTechnical(r.name, d);
        const where = statusOf.get(r.normalizedName)?.location;
        return {
          question: bank.question,
          category: 'TECHNICAL' as const,
          difficulty: d,
          expectedTopics: [r.name, ...bank.topics],
          rationale: `The job ${r.importance === 'REQUIRED' ? 'requires' : 'prefers'} ${r.name}; your resume shows it${where === 'EXPERIENCE' ? ' in your work experience' : ''}.`,
        };
      }),
      // Gap questions: honest, open questions about skills the resume doesn't show.
      ...missing.map((r) => ({
        question: `The role requires ${r.name}. What is your experience with ${r.name} or similar tools, and how would you get up to speed?`,
        category: 'TECHNICAL' as const,
        difficulty: d,
        expectedTopics: [r.name, 'honest assessment', 'related experience', 'learning plan'],
        rationale: `The job requires ${r.name}, which wasn’t found in your resume — expect to be asked. Answer honestly.`,
      })),
    ],
    PROJECT: [
      ...content.projects
        .slice(0, 3)
        .filter((p) => p.name)
        .map((p) => ({
          question: `Tell me about ${p.name}. What was your role, and what was the hardest part?`,
          category: 'PROJECT' as const,
          difficulty: d,
          expectedTopics: ['your role', ...p.technologies.slice(0, 3), 'challenge', 'outcome'],
          rationale: `From your resume: project ${p.name}.`,
        })),
      ...content.experiences.flatMap((e) =>
        e.responsibilities
          .filter((line) =>
            detectSkills(line).some((s) => required.some((r) => r.normalizedName === skillKey(s))),
          )
          .slice(0, 2)
          .map((line) => ({
            question: `Your resume mentions: “${line}”. Walk me through how you did that and what was challenging.`,
            category: 'PROJECT' as const,
            difficulty: d,
            expectedTopics: [...detectSkills(line), 'your approach', 'challenge', 'result'],
            rationale: 'A resume line that matches the job’s requirements.',
          })),
      ),
    ],
    ROLE_SPECIFIC: ctx.job.requirements
      .filter((r) => r.type === 'RESPONSIBILITY')
      .map((r) => ({
        question: `This role involves “${r.name}”. How would you approach it, and what similar work have you done?`,
        category: 'ROLE_SPECIFIC' as const,
        difficulty: d,
        expectedTopics: [...detectSkills(r.name), 'approach', 'relevant experience'],
        rationale: 'A responsibility listed in the job description.',
      })),
    BEHAVIORAL: [...BEHAVIORAL_BANK]
      .sort((a, b) => Number(b.difficulty === d) - Number(a.difficulty === d))
      .map((b) => ({
        question: b.question,
        category: 'BEHAVIORAL' as const,
        difficulty: d,
        expectedTopics: STAR_TOPICS,
        rationale:
          'A common behavioral question — answer with a real example (situation, task, action, result).',
      })),
    SITUATIONAL: SITUATIONAL_BANK.map((q) => ({
      question: q,
      category: 'SITUATIONAL' as const,
      difficulty: d,
      expectedTopics: ['priorities', 'communication', 'reasoning'],
      rationale: null,
    })),
    COMPANY: [
      {
        question: `What do you know about ${ctx.job.companyName}, and why do you want to work there?`,
        category: 'COMPANY',
        difficulty: d,
        expectedTopics: ['company research', 'motivation', 'role fit'],
        rationale: 'Prepare this from your own research.',
      },
    ],
    HR: [
      {
        question: 'Why are you looking for a new opportunity?',
        category: 'HR',
        difficulty: d,
        expectedTopics: ['motivation', 'professional tone'],
        rationale: null,
      },
      {
        question: 'What are your salary expectations?',
        category: 'HR',
        difficulty: d,
        expectedTopics: ['range', 'flexibility'],
        rationale:
          ctx.profile.details.salaryMin !== null
            ? 'Your profile has a salary range you can use.'
            : 'Your profile has no expected salary yet.',
      },
      {
        question: 'What is your notice period, and when could you start?',
        category: 'HR',
        difficulty: d,
        expectedTopics: ['notice period', 'start date'],
        rationale: ctx.profile.details.noticePeriod
          ? `Your profile says: ${ctx.profile.details.noticePeriod}.`
          : null,
      },
      {
        question: 'Where do you see yourself in the next few years?',
        category: 'HR',
        difficulty: d,
        expectedTopics: ['growth', 'role fit'],
        rationale: null,
      },
      {
        question: 'Which work setup do you prefer — remote, hybrid or on-site?',
        category: 'HR',
        difficulty: d,
        expectedTopics: ['work mode', 'flexibility'],
        rationale: null,
      },
    ],
  };

  const used = new Set<string>();
  const cursor = new Map<InterviewQuestionCategory, number>();
  const take = (category: InterviewQuestionCategory): DraftQuestion | null => {
    const pool = pools[category];
    let i = cursor.get(category) ?? 0;
    while (i < pool.length) {
      const q = pool[i++]!;
      cursor.set(category, i);
      if (!used.has(normalize(q.question))) {
        used.add(normalize(q.question));
        return q;
      }
    }
    cursor.set(category, i);
    return null;
  };

  const out: DraftQuestion[] = [];
  for (const category of MIX[settings.focus]) {
    if (out.length >= settings.count) break;
    const q = take(category);
    if (q) out.push(q);
  }
  // Top up from any category that still has unused questions, keeping the focus's preference order.
  const fallback = [
    ...new Set([
      ...MIX[settings.focus],
      'TECHNICAL',
      'BEHAVIORAL',
      'SITUATIONAL',
      'HR',
    ] as InterviewQuestionCategory[]),
  ];
  while (out.length < settings.count) {
    let q: DraftQuestion | null = null;
    for (const category of fallback) {
      q = take(category);
      if (q) break;
    }
    if (!q) break;
    out.push(q);
  }
  return out;
}
