import { createHash } from 'node:crypto';
import type {
  EmploymentType,
  JobRequirementDetector,
  JobRequirementImportance,
  JobRequirementOrigin,
  JobRequirementType,
  SeniorityLevel,
} from '@job-assist/shared';
import { detectSkills, skillKey } from '../../../common/skills/skill-normalization.js';

/**
 * Deterministic job-description analyser. Everything it reports is taken from the text:
 * requirement names and evidence are verbatim lines; importance is EXPLICIT when the
 * posting states it (section heading or "must"/"nice to have" wording) and INFERRED otherwise.
 */
export const JOB_ANALYZER_VERSION = 'job-analyzer@1';

export interface DraftRequirement {
  type: JobRequirementType;
  name: string;
  normalizedName: string;
  importance: JobRequirementImportance;
  origin: JobRequirementOrigin;
  detectedBy: JobRequirementDetector;
  evidence: string | null;
  minYears: number | null;
}

export interface DeterministicJobAnalysis {
  summary: string | null;
  requirements: DraftRequirement[];
  keywords: string[];
  seniority: SeniorityLevel | null;
  seniorityOrigin: 'STATED' | 'INFERRED' | null;
  employmentType: EmploymentType | null;
  confidence: number;
}

// ─── Text normalisation ──────────────────────────────────────────────────────

const BULLET = /^\s*(?:[-–—•*·▪●◦‣]|\d{1,2}[.)])\s+/;

/** Unifies line endings, bullets and whitespace; keeps line structure. */
export function normalizeJobDescription(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\t/g, ' ').replace(/ {2,}/g, ' ').trimEnd())
    .map((line) => (BULLET.test(line) ? `- ${line.replace(BULLET, '').trim()}` : line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Identity of a posting for duplicate detection (same title, company and text). */
export function jobContentHash(title: string, company: string, normalizedDescription: string) {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return createHash('sha256')
    .update([norm(title), norm(company), norm(normalizedDescription)].join('\n'))
    .digest('hex');
}

// ─── Sections ────────────────────────────────────────────────────────────────

type SectionKind = 'intro' | 'required' | 'preferred' | 'responsibilities' | 'other';

const HEADINGS: [SectionKind, RegExp][] = [
  [
    'preferred',
    /^(nice[\s-]to[\s-]haves?|preferred(\s+(qualifications|skills|experience))?|bonus(\s+points)?|good[\s-]to[\s-]haves?|desired(\s+skills)?|desirable|pluses|it would be (great|nice) if( you have)?|additional (skills|qualifications))$/i,
  ],
  [
    'required',
    /^(requirements?|qualifications?|(minimum|basic|required|key)\s+(qualifications|requirements|skills)|required\s+(skills|experience)|must[\s-]haves?|what (you['’]ll|you will) (need|bring)|what we['’]re looking for|what we are looking for|who you are|about you|your (profile|skills|background)|you (have|bring)|skills( (&|and) (experience|qualifications))?|technical skills|experience)$/i,
  ],
  [
    'responsibilities',
    /^((key|main|core)?\s*responsibilities|what (you['’]ll|you will) do|your (role|responsibilities|mission)|the role|role (overview|description|responsibilities)|duties|day[\s-]to[\s-]day|in this role(,)? you will|you will)$/i,
  ],
  [
    'intro',
    /^(about the (role|job|position|opportunity)|overview|(job|role|position) (description|summary|overview)|summary|the opportunity)$/i,
  ],
  [
    'other',
    /^(benefits|perks|what we offer|about (us|the company|the team|[a-z0-9 &.]+)|why (join|work with) us|compensation|salary|how to apply|equal opportunity.*|our (culture|values))$/i,
  ],
];

interface Line {
  text: string;
  section: SectionKind;
  bullet: boolean;
}

function headingKind(raw: string): { kind: SectionKind; rest: string } | null {
  const text = raw
    .replace(/^#+\s*/, '')
    .replace(/\*\*/g, '')
    .trim();
  if (text.length === 0 || text.length > 70 || text.startsWith('- ')) return null;
  const colon = text.indexOf(':');
  const label = (colon >= 0 ? text.slice(0, colon) : text).trim().replace(/[.!]$/, '');
  const rest = colon >= 0 ? text.slice(colon + 1).trim() : '';
  for (const [kind, pattern] of HEADINGS) if (pattern.test(label)) return { kind, rest };
  return null;
}

function splitLines(normalized: string): Line[] {
  let section: SectionKind = 'intro';
  const lines: Line[] = [];
  for (const raw of normalized.split('\n')) {
    if (raw.trim() === '') continue;
    const heading = headingKind(raw);
    if (heading) {
      section = heading.kind;
      if (heading.rest) lines.push({ text: heading.rest, section, bullet: false });
      continue;
    }
    const bullet = raw.startsWith('- ');
    lines.push({ text: bullet ? raw.slice(2).trim() : raw.trim(), section, bullet });
  }
  return lines;
}

// ─── Line classification ─────────────────────────────────────────────────────

const PREFERRED_WORDING =
  /\b(nice[\s-]to[\s-]have|preferred|preferably|bonus|a plus|is a plus|are a plus|good to have|desirable|would be (great|nice)|familiarity with|exposure to|ideally)\b/i;
const REQUIRED_WORDING = /\b(must|required|requires|mandatory|essential|need to have|minimum)\b/i;
const YEARS = /(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?\+?\s*(?:years?|yrs?)\b/i;
const DEGREE =
  /\b(bachelor(?:['’]s)?|master(?:['’]s)?|ph\.?\s?d|doctorate|b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b|b\.?\s?sc|m\.?\s?sc|mba|bca|mca|degree|diploma|graduate in|university degree)\b/i;
const GENERIC_WORDS = new Set(
  'a an and or the of in on with for to at by as is are be have has strong solid good great excellent deep proven hands hands-on working work knowledge understanding familiarity proficiency proficient experience experienced expertise skills skill ability able years year plus using use similar related relevant modern such including etc e g ie technologies technology tools frameworks framework languages language'.split(
    ' ',
  ),
);

function lineImportance(line: Line): {
  importance: JobRequirementImportance;
  origin: JobRequirementOrigin;
} {
  if (PREFERRED_WORDING.test(line.text)) return { importance: 'PREFERRED', origin: 'EXPLICIT' };
  if (line.section === 'preferred') return { importance: 'PREFERRED', origin: 'EXPLICIT' };
  if (line.section === 'required' || REQUIRED_WORDING.test(line.text))
    return { importance: 'REQUIRED', origin: 'EXPLICIT' };
  return { importance: 'REQUIRED', origin: 'INFERRED' };
}

const textKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#./ ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

const evidenceOf = (text: string) => (text.length > 300 ? `${text.slice(0, 297)}…` : text);

/** Words left in a line once skills and generic requirement words are removed. */
function significantWords(text: string, skills: string[]): string[] {
  let rest = ` ${text.toLowerCase()} `;
  for (const skill of skills) rest = rest.split(skill.toLowerCase()).join(' ');
  return rest
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !GENERIC_WORDS.has(w) && !/^\d+$/.test(w));
}

// ─── Keywords, seniority, employment type ────────────────────────────────────

const DOMAIN_TERMS: [string, RegExp][] = [
  ['SaaS', /\bsaas\b/i],
  ['Dashboards', /\bdashboards?\b/i],
  ['B2B', /\bb2b\b/i],
  ['Fintech', /\bfin[\s-]?tech\b/i],
  ['E-commerce', /\be[\s-]?commerce\b/i],
  ['IoT', /\biot\b/i],
  ['Real-time', /\breal[\s-]?time\b/i],
  ['Accessibility', /\baccessib(le|ility)\b|\bwcag\b|\ba11y\b/i],
  [
    'Performance optimization',
    /\bperformance (optimi[sz]ation|tuning)\b|\boptimi[sz]e (application |app |web )?performance\b/i,
  ],
  ['Responsive design', /\bresponsive\b/i],
  ['Design systems', /\bdesign systems?\b/i],
  ['Component libraries', /\b(reusable )?components?( library| libraries)?\b/i],
  ['API integration', /\bapi integrations?\b|\bintegrat(e|ing) (with )?(rest(ful)? )?apis?\b/i],
  ['Code review', /\bcode reviews?\b/i],
  ['Agile', /\bagile\b|\bscrum\b/i],
  ['Data visualization', /\bdata visuali[sz]ation\b|\bcharts?\b/i],
  ['Security', /\bsecurity\b|\bsecure\b/i],
  ['Mobile', /\bmobile\b/i],
  ['Cloud', /\bcloud\b/i],
  ['Mentoring', /\bmentor(ing|ship)?\b/i],
];

const SENIORITY_WORDS: [SeniorityLevel, RegExp][] = [
  ['INTERN', /\bintern(ship)?\b/i],
  ['PRINCIPAL', /\b(principal|staff)\b/i],
  ['LEAD', /\b(lead|team lead|tech lead|head of)\b/i],
  ['SENIOR', /\b(senior|sr\.?)\b/i],
  ['JUNIOR', /\b(junior|jr\.?|entry[\s-]level|graduate|fresher)\b/i],
  ['MID', /\b(mid[\s-]?level|intermediate|mid[\s-]senior)\b/i],
];

const EMPLOYMENT_WORDS: [EmploymentType, RegExp][] = [
  ['INTERNSHIP', /\binternship\b/i],
  ['PART_TIME', /\bpart[\s-]time\b/i],
  ['FULL_TIME', /\bfull[\s-]time\b|\bpermanent\b/i],
  ['CONTRACT', /\bcontract(or)?\b/i],
  ['FREELANCE', /\bfreelance\b/i],
  ['TEMPORARY', /\btemporary\b|\btemp\b/i],
];

function seniorityFromYears(years: number): SeniorityLevel {
  if (years < 2) return 'JUNIOR';
  if (years < 5) return 'MID';
  if (years < 8) return 'SENIOR';
  return 'LEAD';
}

const METADATA_LINE =
  /^(company|location|employment type|job type|salary|department|team|posted|apply)\s*:/i;

function extractSummary(lines: Line[], title: string): string | null {
  const intro = lines
    .filter((l) => l.section === 'intro' && !l.bullet)
    .map((l) => l.text)
    .filter((t) => !METADATA_LINE.test(t) && t.toLowerCase() !== title.trim().toLowerCase())
    .filter((t) => t.split(/\s+/).length >= 6);
  if (intro.length === 0) return null;
  const sentences = intro.join(' ').match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [];
  let summary = '';
  for (const sentence of sentences) {
    if (summary && summary.length + sentence.length > 400) break;
    summary += sentence;
    if (summary.length >= 160) break;
  }
  summary = summary.trim();
  return summary.length > 0 ? summary.slice(0, 500) : null;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function analyzeJobText(input: {
  title: string;
  description: string;
}): DeterministicJobAnalysis {
  const normalized = normalizeJobDescription(input.description);
  const lines = splitLines(normalized);
  const requirements = new Map<string, DraftRequirement>();

  const add = (req: Omit<DraftRequirement, 'detectedBy'>) => {
    const key = `${req.type}|${req.normalizedName}`;
    const existing = requirements.get(key);
    // Keep the strongest statement: REQUIRED over PREFERRED, EXPLICIT over INFERRED.
    const rank = (r: Pick<DraftRequirement, 'importance' | 'origin'>) =>
      (r.importance === 'REQUIRED' ? 2 : 0) + (r.origin === 'EXPLICIT' ? 1 : 0);
    if (!existing || rank(req) > rank(existing)) {
      requirements.set(key, { ...req, detectedBy: 'PARSER' });
    }
  };

  for (const line of lines) {
    if (line.section === 'other') continue;
    const { importance, origin } = lineImportance(line);
    const skills = detectSkills(line.text);
    for (const skill of skills) {
      add({
        type: 'SKILL',
        name: skill,
        normalizedName: skillKey(skill),
        importance,
        origin,
        evidence: evidenceOf(line.text),
        minYears: null,
      });
    }

    if (line.section === 'responsibilities') {
      add({
        type: 'RESPONSIBILITY',
        name: line.text,
        normalizedName: textKey(line.text),
        importance: 'REQUIRED',
        origin: 'EXPLICIT',
        evidence: evidenceOf(line.text),
        minYears: null,
      });
      continue;
    }

    const years = line.text.match(YEARS);
    if (years && /experience|exp\b|working|professional|industry|background/i.test(line.text)) {
      add({
        type: 'EXPERIENCE',
        name: line.text,
        normalizedName: textKey(line.text),
        importance,
        origin,
        evidence: evidenceOf(line.text),
        minYears: Number(years[1]),
      });
      continue;
    }
    if (DEGREE.test(line.text) && line.section !== 'intro') {
      add({
        type: 'EDUCATION',
        name: line.text,
        normalizedName: textKey(line.text),
        importance,
        origin,
        evidence: evidenceOf(line.text),
        minYears: null,
      });
      continue;
    }
    if (
      (line.section === 'required' || line.section === 'preferred') &&
      significantWords(line.text, skills).length >= 2
    ) {
      add({
        type: 'OTHER',
        name: line.text,
        normalizedName: textKey(line.text),
        importance,
        origin,
        evidence: evidenceOf(line.text),
        minYears: null,
      });
    }
  }

  const list = [...requirements.values()];
  const skills = list.filter((r) => r.type === 'SKILL');
  const keywords = [
    ...new Set([
      ...skills.map((s) => s.name),
      ...DOMAIN_TERMS.filter(([, pattern]) => pattern.test(normalized)).map(([term]) => term),
    ]),
  ];

  const headText = `${input.title}\n${lines
    .slice(0, 3)
    .map((l) => l.text)
    .join('\n')}`;
  const statedSeniority =
    SENIORITY_WORDS.find(([, pattern]) => pattern.test(headText))?.[0] ?? null;
  const minYears = list
    .filter((r) => r.type === 'EXPERIENCE' && r.importance === 'REQUIRED' && r.minYears !== null)
    .map((r) => r.minYears!)
    .sort((a, b) => b - a)[0];
  const seniority =
    statedSeniority ?? (minYears !== undefined ? seniorityFromYears(minYears) : null);

  const hasSection = (kind: SectionKind) => lines.some((l) => l.section === kind);
  const confidence =
    0.2 +
    (hasSection('required') ? 0.2 : 0) +
    (skills.length >= 3 ? 0.15 : 0) +
    (list.filter((r) => r.type === 'RESPONSIBILITY').length >= 2 ? 0.15 : 0) +
    (list.some((r) => r.type === 'EXPERIENCE') ? 0.1 : 0) +
    (hasSection('preferred') || list.some((r) => r.type === 'EDUCATION') ? 0.1 : 0) +
    (normalized.length >= 600 ? 0.1 : 0);

  return {
    summary: extractSummary(lines, input.title),
    requirements: list,
    keywords,
    seniority,
    seniorityOrigin: statedSeniority ? 'STATED' : seniority ? 'INFERRED' : null,
    employmentType: EMPLOYMENT_WORDS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null,
    confidence: Math.round(Math.min(1, confidence) * 100) / 100,
  };
}

/** True when the analysis found nothing to compare resumes against. */
export function isInsufficient(analysis: Pick<DeterministicJobAnalysis, 'requirements'>): boolean {
  return !analysis.requirements.some((r) => r.type !== 'EDUCATION');
}
