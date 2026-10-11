import type {
  ResumeCertificationEntry,
  ResumeContactInfo,
  ResumeContent,
  ResumeEducationEntry,
  ResumeExperienceEntry,
  ResumeProjectEntry,
  ResumeSkillEntry,
} from '@job-assist/shared';
import { categorizeSkill, categoryFromLabel, detectTechnologies } from './skill-dictionary.js';

/**
 * Deterministic (rule-based) resume parser.
 *
 * It only reorganises text that is present in the resume: every value it returns is a
 * substring (or normalised date) of the input. It never infers skills, titles or
 * metrics. Output is a *suggestion* the user reviews — never written to the profile
 * automatically. Bump PARSER_VERSION whenever behaviour changes.
 */
export const PARSER_VERSION = 'deterministic-1';

type SectionKey =
  | 'summary'
  | 'skills'
  | 'experience'
  | 'education'
  | 'projects'
  | 'certifications'
  | 'achievements'
  | 'languages'
  | 'other';

const SECTION_HEADINGS: [SectionKey, RegExp][] = [
  [
    'summary',
    /^(professional\s+|career\s+|executive\s+)?(summary|profile|objective|about(\s+me)?|overview)$/,
  ],
  [
    'skills',
    /^((technical|key|core|professional)\s+)?(skills|competencies|expertise|technologies|tech\s+stack|skills\s*(&|and)\s*tools)$/,
  ],
  [
    'experience',
    /^((professional|work|relevant)\s+)?(experience|employment(\s+history)?|work\s+history|career\s+history)$/,
  ],
  [
    'education',
    /^(education|academic\s+(background|qualifications)|qualifications|education\s*(&|and)\s*training)$/,
  ],
  ['projects', /^((key|personal|academic|selected|notable)\s+)?projects$/],
  [
    'certifications',
    /^(certifications?|licenses?(\s*(&|and)\s*certifications?)?|certificates|courses(\s*(&|and)\s*certifications?)?)$/,
  ],
  [
    'achievements',
    /^(achievements|awards(\s*(&|and)\s*(honors|achievements))?|honors(\s*(&|and)\s*awards)?|accomplishments)$/,
  ],
  ['languages', /^(languages|language\s+skills|languages\s+known)$/],
  [
    'other',
    /^(interests|hobbies|references|personal\s+(details|information)|declaration|volunteer(ing)?(\s+experience)?|publications)$/,
  ],
];

const BULLET = /^[•▪●◦‣∙·*\-–—]\s*/;
const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_TOKEN = `(?:${MONTH}\\.?\\s*['’]?\\d{2,4}|\\d{1,2}[/.-]\\d{4}|\\d{4})`;
const PRESENT = '(?:present|current|now|till\\s+date|to\\s+date|ongoing|today)';
const DATE_RANGE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:–|—|-|to|until)\\s*(${DATE_TOKEN}|${PRESENT})`,
  'i',
);
const SINGLE_YEAR = /\b(19|20)\d{2}\b/;

const TITLE_KEYWORDS =
  /\b(developer|engineer|manager|intern|analyst|lead|architect|designer|consultant|specialist|scientist|administrator|programmer|director|officer|associate|head|founder|tester|trainee|devops|sde|sre)\b/i;
const DEGREE_PATTERN =
  /\b(b\.?\s?tech|m\.?\s?tech|b\.?\s?e\.?|m\.?\s?e\.?|b\.?\s?sc|m\.?\s?sc|b\.?\s?com|m\.?\s?com|bca|mca|mba|bba|ph\.?\s?d|bachelor(?:'s)?|master(?:'s)?|diploma|associate(?:'s)? degree|doctorate|high school|hsc|ssc|secondary|intermediate)\b/i;
const INSTITUTION_PATTERN =
  /\b(university|college|institute|school|academy|polytechnic|iit|nit|iiit)\b/i;
const GRADE_PATTERN =
  /\b(?:c?gpa|cpi|percentage|grade|score)\s*[:-]?\s*(\d{1,2}(?:\.\d{1,2})?\s*(?:\/\s*\d{1,3}(?:\.\d)?)?\s*%?)|\b(\d{2}(?:\.\d{1,2})?\s*%)/i;
const ACHIEVEMENT_HINT =
  /\d+\s*%|\b\d+x\b|\b(improved|increased|reduced|decreased|saved|grew|boosted|cut|achieved|awarded|won|recognized|recognised|ranked|accelerated|optimized|optimised)\b/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,5}\)[\s.-]?)?\d{3,5}[\s.-]?\d{3,5}(?:[\s.-]?\d{2,4})?/;
const LINKEDIN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?/i;
const URL =
  /\bhttps?:\/\/[^\s|,]+|\b(?:www\.)[^\s|,]+|\b[a-z0-9-]+\.(?:dev|io|me|app|site|tech|com|net|org|in)(?:\/[^\s|,]*)?\b/i;
const LOCATION_LABEL = /^(?:location|address|based in)\s*[:-]\s*(.+)$/i;
const CITY_COUNTRY = /^[A-Za-z][A-Za-z .'-]{1,40},\s*[A-Za-z][A-Za-z .'-]{1,40}$/;

interface Section {
  key: SectionKey;
  lines: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function headingKey(line: string): SectionKey | null {
  const candidate = line
    .replace(/[:：]$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (candidate.length === 0 || candidate.length > 45 || candidate.split(' ').length > 5)
    return null;
  return SECTION_HEADINGS.find(([, pattern]) => pattern.test(candidate))?.[0] ?? null;
}

const isBullet = (line: string) => BULLET.test(line);
const stripBullet = (line: string) => line.replace(BULLET, '').trim();

function ensureUrl(value: string): string {
  const trimmed = value.replace(/[).,;]+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** Normalises a date token to `YYYY-MM-01` (or `YYYY-01-01` for a bare year). */
export function normalizeDate(token: string): string | null {
  const value = token.trim().toLowerCase();
  const monthYear = value.match(new RegExp(`^(${MONTH})\\.?\\s*['’]?(\\d{2,4})$`, 'i'));
  if (monthYear) {
    const month = MONTHS[monthYear[1]!.slice(0, 3)]!;
    let year = Number(monthYear[2]);
    if (year < 100) year += year > 50 ? 1900 : 2000;
    return `${year}-${String(month).padStart(2, '0')}-01`;
  }
  const numeric = value.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (numeric && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 12) {
    return `${numeric[2]}-${numeric[1]!.padStart(2, '0')}-01`;
  }
  const year = value.match(/^(\d{4})$/);
  if (year) return `${year[1]}-01-01`;
  return null;
}

interface DateRange {
  start: string | null;
  end: string | null;
  isCurrent: boolean;
  matched: string;
}

function findDateRange(text: string): DateRange | null {
  const match = text.match(DATE_RANGE);
  if (!match) return null;
  const isCurrent = new RegExp(`^${PRESENT}$`, 'i').test(match[2]!.trim());
  return {
    start: normalizeDate(match[1]!),
    end: isCurrent ? null : normalizeDate(match[2]!),
    isCurrent,
    matched: match[0],
  };
}

function splitHeaderParts(text: string): string[] {
  return text
    .split(/\s*(?:\||•|·|\s[–—-]\s|\s@\s|\sat\s)\s*/)
    .map((part) => part.replace(/^[,;:()\s]+|[,;:()\s]+$/g, '').trim())
    .filter((part) => part.length > 0);
}

/** Groups section lines into entries: a new entry starts at a non-bullet line following bullets, or at a second dated header. */
function groupEntries(lines: string[]): { header: string[]; body: string[] }[] {
  const entries: { header: string[]; body: string[] }[] = [];
  let current: { header: string[]; body: string[] } | null = null;
  let currentHasDate = false;

  for (const line of lines) {
    if (line === '') {
      if (current && current.body.length > 0) current = null;
      continue;
    }
    const bullet = isBullet(line);
    const hasDate = DATE_RANGE.test(line);
    const startsNew =
      !current || (!bullet && (current.body.length > 0 || (hasDate && currentHasDate)));
    if (startsNew && !bullet) {
      current = { header: [], body: [] };
      currentHasDate = false;
      entries.push(current);
    } else if (!current) {
      current = { header: [], body: [] };
      currentHasDate = false;
      entries.push(current);
    }
    if (bullet || (current.header.length >= 3 && !hasDate)) current.body.push(stripBullet(line));
    else {
      current.header.push(line);
      if (hasDate) currentHasDate = true;
    }
  }
  return entries.filter((entry) => entry.header.length > 0 || entry.body.length > 0);
}

// ─── Sections ────────────────────────────────────────────────────────────────

function splitSections(lines: string[]): { header: string[]; sections: Section[] } {
  const header: string[] = [];
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of lines) {
    const key = headingKey(line);
    if (key) {
      current = { key, lines: [] };
      sections.push(current);
    } else if (current) current.lines.push(line);
    else header.push(line);
  }
  return { header, sections };
}

function linesOf(sections: Section[], key: SectionKey): string[] {
  return sections.filter((s) => s.key === key).flatMap((s) => [...s.lines, '']);
}

function parseContact(headerLines: string[], allText: string): ResumeContactInfo {
  const email = allText.match(EMAIL)?.[0] ?? null;
  const linkedin = allText.match(LINKEDIN)?.[0];
  const github = allText.match(GITHUB)?.[0];

  // Phone: only from header/contact lines, digits count between 8 and 15.
  let phone: string | null = null;
  for (const line of headerLines) {
    for (const candidate of line.replace(EMAIL, ' ').split(/\s*[|•·,]\s*/)) {
      const match = candidate.match(PHONE)?.[0]?.trim();
      const digits = match?.replace(/\D/g, '') ?? '';
      if (match && digits.length >= 8 && digits.length <= 15 && !DATE_RANGE.test(match)) {
        phone = match;
        break;
      }
    }
    if (phone) break;
  }

  let portfolio: string | null = null;
  for (const line of headerLines) {
    for (const part of line.split(/\s*[|•·]\s*|\s{2,}/)) {
      if (EMAIL.test(part) || LINKEDIN.test(part) || GITHUB.test(part)) continue;
      const url = part.match(URL)?.[0];
      if (url) {
        portfolio = ensureUrl(url);
        break;
      }
    }
    if (portfolio) break;
  }

  let location: string | null = null;
  for (const line of headerLines) {
    const labelled = line.match(LOCATION_LABEL)?.[1];
    if (labelled) {
      location = labelled.trim();
      break;
    }
    const part = line
      .split(/\s*[|•·]\s*/)
      .find((p) => CITY_COUNTRY.test(p.trim()) && !EMAIL.test(p));
    if (part) {
      location = part.trim();
      break;
    }
  }

  const fullName =
    headerLines
      .slice(0, 4)
      .map((line) => line.trim())
      .find(
        (line) =>
          /^[\p{L}][\p{L} .'-]{1,60}$/u.test(line) &&
          line.split(/\s+/).length >= 2 &&
          line.split(/\s+/).length <= 5 &&
          !TITLE_KEYWORDS.test(line),
      ) ?? null;

  return {
    fullName,
    email,
    phone,
    location,
    linkedinUrl: linkedin ? ensureUrl(linkedin) : null,
    githubUrl: github ? ensureUrl(github) : null,
    portfolioUrl: portfolio,
  };
}

function parseSkills(lines: string[]): ResumeSkillEntry[] {
  const skills: ResumeSkillEntry[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    if (!raw) continue;
    let line = stripBullet(raw);
    let labelCategory = null;
    const label = line.match(/^([A-Za-z &/-]{2,40}):\s*(.+)$/);
    if (label) {
      labelCategory = categoryFromLabel(label[1]!);
      line = label[2]!;
    }
    for (const token of line.split(/\s*(?:,|\||•|·|;|\s\/\s)\s*/)) {
      const name = token.replace(/^[(\s]+|[)\s.]+$/g, '').trim();
      const wordCount = name.split(/\s+/).length;
      if (!name || name.length > 40 || wordCount > 4 || /^\d+$/.test(name)) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const known = categorizeSkill(name);
      skills.push({ name, category: known !== 'OTHER' ? known : (labelCategory ?? 'OTHER') });
    }
  }
  return skills;
}

function parseExperience(lines: string[]): ResumeExperienceEntry[] {
  return groupEntries(lines)
    .map(({ header, body }) => {
      const headerText = header.join(' | ');
      const range = findDateRange(headerText);
      const parts = splitHeaderParts(range ? headerText.replace(range.matched, ' ') : headerText);

      const titleIndex = parts.findIndex((p) => TITLE_KEYWORDS.test(p));
      const jobTitle = titleIndex >= 0 ? parts[titleIndex]! : null;
      const rest = parts.filter((_, i) => i !== titleIndex);
      // A location is only taken when something else remains to be the company.
      const locationPart =
        rest.length > 1
          ? (rest.slice(1).find((p) => CITY_COUNTRY.test(p) || /^remote$/i.test(p)) ?? null)
          : null;
      const company = rest.find((p) => p !== locationPart && !SINGLE_YEAR.test(p)) ?? null;

      const responsibilities: string[] = [];
      const achievements: string[] = [];
      for (const line of body)
        (ACHIEVEMENT_HINT.test(line) ? achievements : responsibilities).push(line);

      return {
        company,
        jobTitle,
        location: locationPart,
        startDate: range?.start ?? null,
        endDate: range?.end ?? null,
        isCurrent: range?.isCurrent ?? false,
        responsibilities,
        achievements,
        technologies: detectTechnologies([headerText, ...body].join('\n')),
      };
    })
    .filter((entry) => entry.company || entry.jobTitle);
}

function parseEducation(lines: string[]): ResumeEducationEntry[] {
  return groupEntries(lines)
    .map(({ header, body }) => {
      const all = [...header, ...body];
      const text = all.join(' | ');
      const range = findDateRange(text);
      const years = range ? null : text.match(/\b(19|20)\d{2}\b/g);

      const degreeLine = all.find((l) => DEGREE_PATTERN.test(l)) ?? null;
      const institutionLine =
        all.find((l) => INSTITUTION_PATTERN.test(l) && l !== degreeLine) ??
        all.find((l) => l !== degreeLine && !GRADE_PATTERN.test(l)) ??
        null;
      const clean = (value: string | null) =>
        value
          ? value
              .replace(range?.matched ?? '\u0000', '')
              .replace(GRADE_PATTERN, '')
              .replace(/\b(19|20)\d{2}\b/g, '')
              .replace(/[|,–—-]\s*$/g, '')
              .replace(/\s{2,}/g, ' ')
              .trim()
              .replace(/[|,–—-]$/, '')
              .trim() || null
          : null;

      let degree = clean(degreeLine);
      let fieldOfStudy: string | null = null;
      const fieldMatch = degree?.match(/^(.*?)\s+(?:in|of)\s+(.+)$/i);
      if (degree && fieldMatch && DEGREE_PATTERN.test(fieldMatch[1]!)) {
        degree = fieldMatch[1]!.trim();
        fieldOfStudy = fieldMatch[2]!.trim();
      }
      const grade = text.match(GRADE_PATTERN);

      return {
        institution: clean(institutionLine === degreeLine ? null : institutionLine),
        degree,
        fieldOfStudy,
        startDate: range?.start ?? (years && years.length > 1 ? `${years[0]}-01-01` : null),
        endDate:
          range?.end ?? (years && years.length > 0 ? `${years[years.length - 1]}-01-01` : null),
        grade: grade ? (grade[1] ?? grade[2] ?? '').trim() || null : null,
      };
    })
    .filter((entry) => entry.institution || entry.degree);
}

function parseProjects(lines: string[]): ResumeProjectEntry[] {
  return groupEntries(lines)
    .map(({ header, body }) => {
      const all = [...header, ...body];
      const text = all.join('\n');
      const techLine = all.find((l) =>
        /^(tech(nologies|\s*stack)?|tools|built with|stack)\s*[:-]/i.test(l),
      );
      const listed = techLine
        ? techLine
            .replace(/^[^:-]+[:-]\s*/, '')
            .split(/\s*[,|]\s*/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
      const titleLine = header[0] ?? '';
      const name = titleLine
        .replace(/^project\s*[:-]\s*/i, '')
        .split(/\s*[|–—]\s*|\s-\s|\s\(/)[0]!
        .trim();
      const url = text.match(URL)?.[0];
      const highlights = body.filter((l) => l !== techLine);
      const description =
        header
          .slice(1)
          .filter((l) => l !== techLine)
          .join(' ') || null;
      return {
        name: name || null,
        description,
        technologies: listed.length > 0 ? listed : detectTechnologies(text),
        highlights,
        url: url ? ensureUrl(url) : null,
      };
    })
    .filter((entry) => entry.name);
}

function parseCertifications(lines: string[]): ResumeCertificationEntry[] {
  return lines
    .filter(Boolean)
    .map(stripBullet)
    .map((line) => {
      const date = line.match(new RegExp(DATE_TOKEN, 'i'));
      const withoutDate = date
        ? line
            .replace(date[0], '')
            .replace(/[(),\s|–—-]+$/g, '')
            .trim()
        : line;
      const [name, issuer] = withoutDate.split(/\s+(?:[–—|-]|by|from)\s+/i);
      return {
        name: (name ?? withoutDate).trim(),
        issuer: issuer?.trim() || null,
        date: date ? normalizeDate(date[0]) : null,
      };
    })
    .filter((c) => c.name.length > 1);
}

/** Languages exactly as written, one per comma/bullet-separated item. */
function parseLanguages(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines
    .filter(Boolean)
    .flatMap((line) => stripBullet(line).split(/\s*[,|•·;]\s*/))
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || item.length > 80 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Total experience in years from (possibly overlapping) ranges, rounded to one decimal. */
export function estimateYearsOfExperience(
  entries: ResumeExperienceEntry[],
  now: Date,
): number | null {
  const toMonths = (iso: string) => {
    const [y, m] = iso.split('-').map(Number);
    return y! * 12 + (m! - 1);
  };
  const nowMonths = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const ranges = entries
    .filter((e) => e.startDate && (e.endDate || e.isCurrent))
    .map((e) => [toMonths(e.startDate!), e.isCurrent ? nowMonths : toMonths(e.endDate!)] as const)
    .filter(([start, end]) => end >= start)
    .sort((a, b) => a[0] - b[0]);
  if (ranges.length === 0) return null;

  let total = 0;
  let [curStart, curEnd] = ranges[0]!;
  for (const [start, end] of ranges.slice(1)) {
    if (start <= curEnd) curEnd = Math.max(curEnd, end);
    else {
      total += curEnd - curStart;
      [curStart, curEnd] = [start, end];
    }
  }
  total += curEnd - curStart;
  return Math.round((total / 12) * 10) / 10;
}

/**
 * The headline is a job-title line in the resume header (typically right under the name),
 * taken verbatim. Lines carrying contact details are skipped; nothing is inferred.
 */
function parseHeadline(headerLines: string[]): string | null {
  return (
    headerLines.find(
      (line) =>
        line.length <= 150 &&
        TITLE_KEYWORDS.test(line) &&
        !EMAIL.test(line) &&
        !URL.test(line) &&
        line.replace(/\D/g, '').length < 8,
    ) ?? null
  );
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function parseResumeText(text: string, now: Date = new Date()): ResumeContent {
  const lines = text.split('\n').map((line) => line.trim());
  const { header, sections } = splitSections(lines);
  const headerLines = header.filter(Boolean);

  const summaryLines = linesOf(sections, 'summary').filter(Boolean);
  const experiences = parseExperience(linesOf(sections, 'experience'));

  return {
    contact: parseContact(headerLines.slice(0, 8), text),
    headline: parseHeadline(headerLines.slice(0, 4)),
    summary: summaryLines.length > 0 ? summaryLines.map(stripBullet).join(' ') : null,
    skills: parseSkills(linesOf(sections, 'skills')),
    experiences,
    educations: parseEducation(linesOf(sections, 'education')),
    projects: parseProjects(linesOf(sections, 'projects')),
    certifications: parseCertifications(linesOf(sections, 'certifications')),
    achievements: linesOf(sections, 'achievements').filter(Boolean).map(stripBullet),
    languages: parseLanguages(linesOf(sections, 'languages')),
    estimatedYearsOfExperience: estimateYearsOfExperience(experiences, now),
  };
}
