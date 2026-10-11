import { type QuestionType } from '@job-assist/shared';
import { detectSkills, skillKey } from '../../../common/skills/skill-normalization.js';
import type { PreparationContext } from '../preparation-context.js';

const TYPES: [QuestionType, RegExp][] = [
  ['SALARY', /\b(salary|compensation|pay|ctc|remuneration|expected (package|rate))\b/i],
  [
    'NOTICE_PERIOD',
    /\b(notice period|start date|when can you (start|join)|availability|available to start|join(ing)? date)\b/i,
  ],
  [
    'WORK_AUTHORIZATION',
    /\b(work (authori[sz]ation|permit)|visa|sponsorship|right to work|authori[sz]ed to work|citizenship)\b/i,
  ],
  ['LOCATION', /\b(relocat\w*|on-?site|hybrid|remote|commute|work from|location)\b/i],
  [
    'MOTIVATION',
    /\b(why (do you|are you|would you|this|our|us)|what (attracts|interests|excites) you|motivat\w*|looking for a new|leave your current)\b/i,
  ],
  [
    'EXPERIENCE',
    /\b(experience|describe|tell us about|worked (on|with)|example of|how have you|projects?)\b/i,
  ],
];

export function classifyQuestion(question: string): QuestionType {
  return TYPES.find(([, pattern]) => pattern.test(question))?.[0] ?? 'OTHER';
}

export interface RuleAnswer {
  answer: string | null;
  missingInformation: string[];
}

/**
 * Answers that can be written from verified data alone (profile facts, resume lines).
 * Anything personal (motivation, opinions) is reported as missing rather than invented.
 */
export function ruleAnswer(
  ctx: PreparationContext,
  question: string,
  type: QuestionType,
): RuleAnswer {
  const d = ctx.profile.details;
  switch (type) {
    case 'SALARY': {
      if (d.salaryMin === null && d.salaryMax === null)
        return {
          answer: null,
          missingInformation: ['Your expected salary (add it to your career profile preferences)'],
        };
      const cur = d.salaryCurrency ? `${d.salaryCurrency} ` : '';
      const range =
        d.salaryMin !== null && d.salaryMax !== null
          ? `${cur}${d.salaryMin.toLocaleString('en')}–${d.salaryMax.toLocaleString('en')}`
          : `${cur}${(d.salaryMin ?? d.salaryMax)!.toLocaleString('en')}`;
      return { answer: `My expected salary is ${range}.`, missingInformation: [] };
    }
    case 'NOTICE_PERIOD':
      return d.noticePeriod
        ? { answer: `My notice period is ${d.noticePeriod}.`, missingInformation: [] }
        : {
            answer: null,
            missingInformation: [
              'Your notice period or earliest start date (add it to your career profile)',
            ],
          };
    case 'WORK_AUTHORIZATION':
      return d.workAuthorization
        ? {
            answer: d.workAuthorization.endsWith('.')
              ? d.workAuthorization
              : `${d.workAuthorization}.`,
            missingInformation: [],
          }
        : {
            answer: null,
            missingInformation: ['Your work authorization (add it to your career profile)'],
          };
    case 'LOCATION': {
      const modes = d.workModes.map((m) => m.toLowerCase().replace('onsite', 'on-site'));
      if (modes.length === 0 && d.preferredLocations.length === 0) {
        return {
          answer: null,
          missingInformation: [
            'Your preferred work modes and locations (career profile preferences)',
          ],
        };
      }
      const parts = [
        modes.length ? `I am open to ${modes.join(', ')} work` : 'My preferred locations are',
        d.preferredLocations.length
          ? `${modes.length ? ' in ' : ' '}${d.preferredLocations.join(', ')}`
          : '',
      ];
      return { answer: `${parts.join('')}.`, missingInformation: [] };
    }
    case 'EXPERIENCE': {
      const asked = detectSkills(question);
      const { content } = ctx.resume;
      const sentences: string[] = [];
      const missing: string[] = [];
      for (const skill of asked.length ? asked : []) {
        const key = skillKey(skill);
        const exp = content.experiences.find((e) =>
          [
            ...e.technologies,
            ...detectSkills([...e.responsibilities, ...e.achievements].join('\n')),
          ].some((t) => skillKey(t) === key),
        );
        if (!exp) {
          missing.push(`Your experience with ${skill} (not found in this resume)`);
          continue;
        }
        const line = [...exp.responsibilities, ...exp.achievements].find((l) =>
          detectSkills(l).some((t) => skillKey(t) === key),
        );
        const role = [exp.jobTitle, exp.company].filter(Boolean).join(' at ');
        sentences.push(
          line
            ? `As ${role}, I used ${skill}: ${line.replace(/\.$/, '')}.`
            : `I used ${skill} as ${role}.`,
        );
      }
      if (asked.length === 0) {
        return {
          answer: null,
          missingInformation: [
            'Which experience to describe (the question names no specific skill)',
          ],
        };
      }
      return { answer: sentences.length ? sentences.join(' ') : null, missingInformation: missing };
    }
    case 'MOTIVATION':
      return {
        answer: null,
        missingInformation: [
          'Your personal reasons for this role and company — only you can provide these',
        ],
      };
    case 'OTHER':
      return { answer: null, missingInformation: ['Information to answer this question'] };
  }
}
