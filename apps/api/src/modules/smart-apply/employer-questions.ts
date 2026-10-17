import { classifyQuestion } from '../application-preparation/rules/answer.rules.js';
import { type Fetch, getJson, htmlToText, TtlCache } from '../job-discovery/sources/http.js';
import { JobSourceError } from '../job-discovery/sources/job-source-adapter.js';
import type { QuestionType } from '@job-assist/shared';

/**
 * The questions on an employer's own application form, where the employer publishes them.
 *
 * Greenhouse: the public Job Board API returns a job's form with `?questions=true`
 * (https://developers.greenhouse.io/job-board.html — public GET, no authentication). Contact
 * and file fields (name, email, phone, resume, cover letter) are filled on the form itself and
 * are skipped; voluntary demographic/compliance sections are left to the official form.
 * Other sources publish no forms, so their applications only have questions the user adds.
 */
export interface EmployerQuestion {
  externalKey: string;
  question: string;
  questionType: QuestionType;
  required: boolean;
  options: string[];
  origin: string;
}

interface GreenhouseField {
  name?: string;
  type?: string;
  values?: { label?: string; value?: unknown }[];
}
interface GreenhouseQuestion {
  label?: string;
  required?: boolean;
  fields?: GreenhouseField[];
}

const API_BASE = 'https://boards-api.greenhouse.io/v1/boards';
const SKIPPED_FIELDS =
  /^(first_name|last_name|preferred_name|email|phone|resume|resume_text|cover_letter|cover_letter_text)$/;
const CACHE_TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

export class EmployerQuestionsReader {
  private readonly cache: TtlCache<EmployerQuestion[]>;

  constructor(
    private readonly fetchFn: Fetch,
    private readonly enabled: boolean,
    now: () => number = () => Date.now(),
  ) {
    this.cache = new TtlCache(CACHE_TTL_MS, now);
  }

  /** Null when the source publishes no form (or reading forms is disabled). */
  async read(
    sourceKey: string | null,
    sourceJobId: string | null,
  ): Promise<EmployerQuestion[] | null> {
    if (!this.enabled || sourceKey !== 'greenhouse' || !sourceJobId) return null;
    const [token, id] = sourceJobId.split(':');
    if (!token || !id) return null;
    return this.cache.get(sourceJobId, async () => {
      const signal = AbortSignal.timeout(TIMEOUT_MS);
      const { status, body } = await getJson(
        this.fetchFn,
        `${API_BASE}/${encodeURIComponent(token)}/jobs/${encodeURIComponent(id)}?questions=true`,
        'Greenhouse',
        signal,
      );
      if (status === 404) throw new JobSourceError('The job is no longer on the employer’s board.');
      const questions = (body as { questions?: unknown } | null)?.questions;
      if (!Array.isArray(questions))
        throw new JobSourceError('Greenhouse returned an unexpected response.');
      return parseGreenhouseQuestions(questions as GreenhouseQuestion[]);
    });
  }
}

export function parseGreenhouseQuestions(questions: GreenhouseQuestion[]): EmployerQuestion[] {
  const out: EmployerQuestion[] = [];
  for (const q of questions) {
    const field = q.fields?.find((f) => f.name && f.type !== 'input_file');
    if (!field?.name || SKIPPED_FIELDS.test(field.name)) continue;
    const label = htmlToText(q.label ?? '').slice(0, 2000);
    if (!label) continue;
    out.push({
      externalKey: `greenhouse:${field.name}`,
      question: label,
      questionType: classifyQuestion(label),
      required: q.required === true,
      options: (field.values ?? [])
        .map((v) => (typeof v.label === 'string' ? v.label.trim() : ''))
        .filter(Boolean)
        .slice(0, 100),
      origin: 'employer’s Greenhouse application form',
    });
  }
  return out;
}
