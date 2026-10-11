import {
  type EvidenceLocation,
  type JobRequirementImportance,
  type JobRequirementType,
  MATCH_DIMENSIONS,
  type MatchDimension,
  type MatchDimensionScores,
  type MatchEvidence,
  type MatchLevel,
  matchLevel,
  type ResponsibilityEvidence,
  type SkillEvidence,
} from '@job-assist/shared';
import {
  detectSkills,
  relatedSkillKeys,
  skillKey,
} from '../../../common/skills/skill-normalization.js';
import {
  EXPERIENCE_YEARS_SHARE,
  IMPORTANCE_WEIGHT,
  RESPONSIBILITY_FULL_OVERLAP,
  RESPONSIBILITY_PARTIAL_OVERLAP,
  SCORING_WEIGHTS,
  SKILL_CREDIT,
} from './scoring-config.js';

/** What the job asks for (from the stored analysis). */
export interface MatchRequirement {
  type: JobRequirementType;
  name: string;
  normalizedName: string;
  importance: JobRequirementImportance;
  minYears: number | null;
}

export interface MatchJob {
  title: string;
  requirements: MatchRequirement[];
  keywords: string[];
}

/** One resume version's (or the profile's) stored, user-confirmed content. */
export interface MatchSubject {
  /** "this resume" / "your profile": used in evidence sentences. */
  label: string;
  skills: string[];
  experiences: {
    jobTitle: string | null;
    company: string | null;
    technologies: string[];
    lines: string[];
  }[];
  projects: { name: string | null; technologies: string[]; lines: string[] }[];
  certifications: { name: string; issuer: string | null }[];
  educations: { institution: string | null; degree: string | null; fieldOfStudy: string | null }[];
  summary: string | null;
  yearsOfExperience: number | null;
  yearsSource: string | null;
}

export interface ScoredMatch {
  overallScore: number;
  level: MatchLevel;
  scores: MatchDimensionScores;
  strengths: string[];
  gaps: string[];
  evidence: MatchEvidence;
}

// ─── Text helpers ────────────────────────────────────────────────────────────

const STOPWORDS = new Set(
  'a an and or the of in on with for to at by as is are be our your their we you will from into across using use via that this these those it its new key all any other within such well both more most strong good'.split(
    ' ',
  ),
);

const stem = (word: string) =>
  word.length > 5 && word.endsWith('ing')
    ? word.slice(0, -3)
    : word.length > 4 && word.endsWith('ed')
      ? word.slice(0, -2)
      : word.length > 3 && word.endsWith('s') && !word.endsWith('ss')
        ? word.slice(0, -1)
        : word;

/** Significant word stems plus canonical skill keys found in the text. */
function tokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#. ]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
  return new Set([...words, ...detectSkills(text).map((s) => `skill:${s.toLowerCase()}`)]);
}

const TITLE_NOISE = new Set(
  'senior sr junior jr lead principal staff mid level intern internship i ii iii iv trainee associate and of the head remote hybrid'.split(
    ' ',
  ),
);

function titleTokens(title: string): Set<string> {
  const normalized = title
    .toLowerCase()
    .replace(/front[\s-]end/g, 'frontend')
    .replace(/back[\s-]end/g, 'backend')
    .replace(/full[\s-]stack/g, 'fullstack');
  return new Set(
    normalized
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w.length > 1 && !TITLE_NOISE.has(w))
      .map((w) => (/^(engineer|developer|programmer|sde|swe)s?$/.test(w) ? 'developer' : w)),
  );
}

const DEGREE_LEVELS: [number, string, RegExp][] = [
  [5, 'Doctorate', /\b(ph\.?\s?d|doctorate|doctoral)\b/i],
  [
    4,
    "Master's degree",
    /\b(master(?:['’]s)?|m\.?\s?tech|m\.?\s?sc|m\.?\s?e\b|mba|mca|m\.?\s?s\b)\b/i,
  ],
  [
    3,
    "Bachelor's degree",
    /\b(bachelor(?:['’]s)?|b\.?\s?tech|b\.?\s?sc|b\.?\s?e\b|b\.?\s?s\b|bca|bba|b\.?\s?com|undergraduate|university degree|degree)\b/i,
  ],
  [2, 'Diploma / associate', /\b(diploma|associate(?:['’]s)? degree)\b/i],
  [1, 'High school', /\b(high school|secondary|hsc|ssc)\b/i],
];

function degreeLevel(text: string): { level: number; label: string } | null {
  for (const [level, label, pattern] of DEGREE_LEVELS)
    if (pattern.test(text)) return { level, label };
  return null;
}

const list = (items: string[], max = 6) =>
  items.length > max
    ? `${items.slice(0, max).join(', ')} and ${items.length - max} more`
    : items.join(', ');

const pct = (value: number) => Math.round(value * 100);

// ─── Skill index ─────────────────────────────────────────────────────────────

interface SkillHit {
  location: EvidenceLocation;
  evidence: string;
}

/** For each skill key, the strongest place it appears in the subject (by SKILL_CREDIT). */
function indexSkills(subject: MatchSubject): Map<string, SkillHit> {
  const index = new Map<string, SkillHit>();
  const put = (name: string, hit: SkillHit) => {
    const key = skillKey(name);
    const current = index.get(key);
    if (!current || SKILL_CREDIT[hit.location] > SKILL_CREDIT[current.location])
      index.set(key, hit);
  };
  for (const exp of subject.experiences) {
    const role = [exp.jobTitle, exp.company].filter(Boolean).join(' at ') || 'an experience entry';
    for (const name of [
      ...exp.technologies,
      ...detectSkills([exp.jobTitle ?? '', ...exp.lines].join('\n')),
    ]) {
      put(name, {
        location: 'EXPERIENCE',
        evidence: `${capital(subject.label)} lists it in work experience: ${role}.`,
      });
    }
  }
  for (const name of subject.skills) {
    put(name, {
      location: 'SKILLS',
      evidence: `${capital(subject.label)} lists it in the skills section, but not in work experience.`,
    });
  }
  for (const project of subject.projects) {
    const projectName = project.name ? `“${project.name}”` : 'a project';
    for (const name of [...project.technologies, ...detectSkills(project.lines.join('\n'))]) {
      put(name, {
        location: 'PROJECTS',
        evidence: `Appears in project ${projectName}, not in work experience.`,
      });
    }
  }
  for (const cert of subject.certifications) {
    for (const name of detectSkills(`${cert.name} ${cert.issuer ?? ''}`)) {
      put(name, {
        location: 'CERTIFICATIONS',
        evidence: `Appears in certification “${cert.name}”, not in work experience.`,
      });
    }
  }
  if (subject.summary) {
    for (const name of detectSkills(subject.summary)) {
      put(name, { location: 'SUMMARY', evidence: 'Mentioned in the summary only.' });
    }
  }
  return index;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ─── Dimensions ──────────────────────────────────────────────────────────────

function scoreSkills(job: MatchJob, subject: MatchSubject, index: Map<string, SkillHit>) {
  const skills = job.requirements.filter((r) => r.type === 'SKILL');
  const evidence: SkillEvidence[] = skills.map((req) => {
    const hit = index.get(req.normalizedName);
    if (hit) {
      return {
        skill: req.name,
        normalizedName: req.normalizedName,
        importance: req.importance,
        status: SKILL_CREDIT[hit.location] >= SKILL_CREDIT.SKILLS ? 'MATCH' : 'PARTIAL',
        credit: SKILL_CREDIT[hit.location],
        location: hit.location,
        evidence: hit.evidence,
      };
    }
    const related = relatedSkillKeys(req.name).find((key) => index.has(key));
    if (related) {
      const relatedName =
        [...subject.skills, ...subject.experiences.flatMap((e) => e.technologies)].find(
          (s) => skillKey(s) === related,
        ) ?? related;
      return {
        skill: req.name,
        normalizedName: req.normalizedName,
        importance: req.importance,
        status: 'PARTIAL',
        credit: SKILL_CREDIT.RELATED_SKILL,
        location: 'RELATED_SKILL',
        evidence: `${req.name} isn’t listed, but the related skill ${relatedName} is.`,
      };
    }
    return {
      skill: req.name,
      normalizedName: req.normalizedName,
      importance: req.importance,
      status: 'MISSING',
      credit: 0,
      location: null,
      evidence: `No ${req.name} experience was found in ${subject.label}.`,
    };
  });
  const total = skills.reduce((sum, r) => sum + IMPORTANCE_WEIGHT[r.importance], 0);
  const earned = evidence.reduce((sum, e) => sum + e.credit * IMPORTANCE_WEIGHT[e.importance], 0);
  return { score: total > 0 ? earned / total : null, evidence };
}

function scoreExperience(job: MatchJob, subject: MatchSubject) {
  const experienceReqs = job.requirements.filter(
    (r) => r.type === 'EXPERIENCE' && r.minYears !== null,
  );
  const pool = experienceReqs.some((r) => r.importance === 'REQUIRED')
    ? experienceReqs.filter((r) => r.importance === 'REQUIRED')
    : experienceReqs;
  const requiredYears = pool.length > 0 ? Math.max(...pool.map((r) => r.minYears!)) : null;
  const have = subject.yearsOfExperience;
  const notes: string[] = [];

  let yearsPart: number | null = null;
  if (requiredYears !== null && requiredYears > 0) {
    if (have === null) {
      yearsPart = 0;
      notes.push(
        `The job asks for ${requiredYears}+ years; the length of experience couldn’t be determined from ${subject.label}.`,
      );
    } else {
      yearsPart = Math.min(1, have / requiredYears);
      notes.push(
        `${have} years of experience (${subject.yearsSource ?? 'stated'}) vs ${requiredYears}+ years asked for.`,
      );
    }
  }

  const wanted = titleTokens(job.title);
  let relevance: number | null = null;
  const relevantTitles: string[] = [];
  if (wanted.size > 0) {
    relevance = 0;
    for (const exp of subject.experiences) {
      if (!exp.jobTitle) continue;
      const have = titleTokens(exp.jobTitle);
      const overlap = [...wanted].filter((t) => have.has(t)).length / wanted.size;
      if (overlap > 0) {
        relevantTitles.push([exp.jobTitle, exp.company].filter(Boolean).join(' at '));
        relevance = Math.max(relevance, overlap);
      }
    }
    if (relevantTitles.length === 0)
      notes.push(`No previous role title in ${subject.label} resembles “${job.title}”.`);
  }

  const score =
    yearsPart !== null && relevance !== null
      ? yearsPart * EXPERIENCE_YEARS_SHARE + relevance * (1 - EXPERIENCE_YEARS_SHARE)
      : (yearsPart ?? relevance);
  return {
    score,
    evidence: {
      requiredYears,
      candidateYears: have,
      yearsSource: have === null ? null : subject.yearsSource,
      relevantTitles,
      notes,
    },
  };
}

function scoreResponsibilities(job: MatchJob, subject: MatchSubject) {
  const responsibilities = job.requirements.filter((r) => r.type === 'RESPONSIBILITY');
  if (responsibilities.length === 0)
    return { score: null, evidence: [] as ResponsibilityEvidence[] };
  const lines = [
    ...subject.experiences.flatMap((e) => e.lines),
    ...subject.projects.flatMap((p) => p.lines),
  ].map((line) => ({ line, tokens: tokens(line) }));

  const evidence = responsibilities.map((req): ResponsibilityEvidence => {
    const wanted = tokens(req.name);
    let best = { overlap: 0, shared: 0, line: null as string | null };
    for (const candidate of lines) {
      const shared = [...wanted].filter((t) => candidate.tokens.has(t)).length;
      const overlap = wanted.size > 0 ? shared / wanted.size : 0;
      if (overlap > best.overlap) best = { overlap, shared, line: candidate.line };
    }
    const status =
      best.shared >= 2 && best.overlap >= RESPONSIBILITY_FULL_OVERLAP
        ? 'MATCH'
        : best.shared >= 2 && best.overlap >= RESPONSIBILITY_PARTIAL_OVERLAP
          ? 'PARTIAL'
          : 'MISSING';
    return {
      responsibility: req.name,
      status,
      matchedLine: status === 'MISSING' ? null : best.line,
    };
  });
  const credit = { MATCH: 1, PARTIAL: 0.5, MISSING: 0 } as const;
  return {
    score: evidence.reduce((sum, e) => sum + credit[e.status], 0) / evidence.length,
    evidence,
  };
}

function scoreProjects(job: MatchJob, subject: MatchSubject) {
  const skills = job.requirements.filter((r) => r.type === 'SKILL');
  if (skills.length === 0) return { score: null, evidence: [] };
  const evidence = subject.projects
    .map((project) => {
      const found = new Set(
        [
          ...project.technologies,
          ...detectSkills([project.name ?? '', ...project.lines].join('\n')),
        ].map(skillKey),
      );
      return {
        project: project.name ?? 'Untitled project',
        matchedSkills: skills.filter((s) => found.has(s.normalizedName)).map((s) => s.name),
      };
    })
    .filter((p) => p.matchedSkills.length > 0);
  const covered = new Set(evidence.flatMap((p) => p.matchedSkills));
  const total = skills.reduce((sum, r) => sum + IMPORTANCE_WEIGHT[r.importance], 0);
  const earned = skills
    .filter((s) => covered.has(s.name))
    .reduce((sum, r) => sum + IMPORTANCE_WEIGHT[r.importance], 0);
  return { score: earned / total, evidence };
}

function scoreEducation(job: MatchJob, subject: MatchSubject) {
  const reqs = job.requirements.filter((r) => r.type === 'EDUCATION');
  const pool = reqs.some((r) => r.importance === 'REQUIRED')
    ? reqs.filter((r) => r.importance === 'REQUIRED')
    : reqs;
  const notes: string[] = [];
  const candidate = subject.educations
    .map((e) => degreeLevel([e.degree, e.fieldOfStudy].filter(Boolean).join(' ')))
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .sort((a, b) => b.level - a.level)[0];
  if (pool.length === 0) {
    return {
      score: null,
      evidence: { requirement: null, candidateHighest: candidate?.label ?? null, met: null, notes },
    };
  }
  const requirement = pool[0]!.name;
  const required = pool
    .map((r) => degreeLevel(r.name))
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .sort((a, b) => a.level - b.level)[0];
  const met = required ? (candidate?.level ?? 0) >= required.level : subject.educations.length > 0;
  let score = met ? 1 : 0;
  if (met)
    notes.push(`${capital(subject.label)} shows ${candidate?.label ?? 'an education entry'}.`);
  else if (/equivalent/i.test(requirement) && (subject.yearsOfExperience ?? 0) >= 3) {
    score = 0.5;
    notes.push('The required degree isn’t shown, but the job accepts equivalent experience.');
  } else {
    notes.push(
      candidate
        ? `${capital(subject.label)} shows ${candidate.label}; the job asks for ${required?.label ?? 'a degree'}.`
        : `No matching education was found in ${subject.label}.`,
    );
  }
  return {
    score,
    evidence: { requirement, candidateHighest: candidate?.label ?? null, met, notes },
  };
}

function scoreKeywords(job: MatchJob, subject: MatchSubject) {
  if (job.keywords.length === 0) return { score: null, evidence: { matched: [], missing: [] } };
  const text = [
    subject.summary ?? '',
    ...subject.skills,
    ...subject.experiences.flatMap((e) => [
      e.jobTitle ?? '',
      e.company ?? '',
      ...e.technologies,
      ...e.lines,
    ]),
    ...subject.projects.flatMap((p) => [p.name ?? '', ...p.technologies, ...p.lines]),
    ...subject.certifications.map((c) => c.name),
  ].join('\n');
  const skillKeys = new Set([...detectSkills(text), ...subject.skills].map(skillKey));
  const lower = text.toLowerCase();
  const matched: string[] = [];
  const missing: string[] = [];
  for (const keyword of job.keywords) {
    const word = keyword.toLowerCase().replace(/s$/, '');
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]?');
    const found =
      skillKeys.has(skillKey(keyword)) || new RegExp(`(?<![\\w])${escaped}`, 'i').test(lower);
    (found ? matched : missing).push(keyword);
  }
  return { score: matched.length / job.keywords.length, evidence: { matched, missing } };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/** Deterministic comparison of one subject against a job's stored analysis. */
export function scoreMatch(job: MatchJob, subject: MatchSubject): ScoredMatch {
  const index = indexSkills(subject);
  const skills = scoreSkills(job, subject, index);
  const experience = scoreExperience(job, subject);
  const responsibilities = scoreResponsibilities(job, subject);
  const projects = scoreProjects(job, subject);
  const education = scoreEducation(job, subject);
  const keywords = scoreKeywords(job, subject);

  const raw: Record<MatchDimension, number | null> = {
    skills: skills.score,
    experience: experience.score,
    responsibilities: responsibilities.score,
    projects: projects.score,
    education: education.score,
    keywords: keywords.score,
  };
  let weighted = 0;
  let weights = 0;
  for (const dimension of MATCH_DIMENSIONS) {
    const value = raw[dimension];
    if (value === null) continue;
    weighted += value * SCORING_WEIGHTS[dimension];
    weights += SCORING_WEIGHTS[dimension];
  }
  const overallScore = weights > 0 ? Math.round((weighted / weights) * 100) : 0;
  const scores = Object.fromEntries(
    MATCH_DIMENSIONS.map((d) => {
      const value = raw[d];
      return [d, value === null ? null : pct(value)];
    }),
  ) as MatchDimensionScores;

  // ── Strengths and gaps, each traceable to the evidence above ──
  const strengths: string[] = [];
  const gaps: string[] = [];
  const required = skills.evidence.filter((e) => e.importance === 'REQUIRED');
  const preferred = skills.evidence.filter((e) => e.importance === 'PREFERRED');
  const matchedRequired = required.filter((e) => e.status === 'MATCH').map((e) => e.skill);
  if (required.length > 0 && matchedRequired.length > 0) {
    strengths.push(
      `Matches ${matchedRequired.length} of ${required.length} required skills: ${list(matchedRequired)}`,
    );
  }
  const matchedPreferred = preferred.filter((e) => e.status === 'MATCH').map((e) => e.skill);
  if (matchedPreferred.length > 0)
    strengths.push(`Also has preferred skills: ${list(matchedPreferred)}`);
  const { requiredYears, candidateYears } = experience.evidence;
  if (requiredYears !== null && candidateYears !== null && candidateYears >= requiredYears) {
    strengths.push(
      `${candidateYears} years of experience meets the ${requiredYears}+ years asked for`,
    );
  }
  if (experience.evidence.relevantTitles.length > 0) {
    strengths.push(`Relevant role: ${experience.evidence.relevantTitles[0]}`);
  }
  const covered = responsibilities.evidence.filter((e) => e.status === 'MATCH').length;
  if (covered > 0) {
    strengths.push(
      `Shows experience with ${covered} of ${responsibilities.evidence.length} listed responsibilities`,
    );
  }
  const bestProject = [...projects.evidence].sort(
    (a, b) => b.matchedSkills.length - a.matchedSkills.length,
  )[0];
  if (bestProject)
    strengths.push(`Project “${bestProject.project}” uses ${list(bestProject.matchedSkills, 4)}`);
  if (education.evidence.met === true) strengths.push('Meets the education requirement');

  const missingRequired = required.filter((e) => e.status === 'MISSING').map((e) => e.skill);
  if (missingRequired.length > 0) gaps.push(`Required skills not found: ${list(missingRequired)}`);
  const partialRequired = required.filter((e) => e.status === 'PARTIAL').map((e) => e.skill);
  if (partialRequired.length > 0) {
    gaps.push(`Required skills not shown in work experience: ${list(partialRequired)}`);
  }
  const missingPreferred = preferred.filter((e) => e.status === 'MISSING').map((e) => e.skill);
  if (missingPreferred.length > 0)
    gaps.push(`Preferred skills not found: ${list(missingPreferred)}`);
  if (requiredYears !== null && (candidateYears === null || candidateYears < requiredYears)) {
    gaps.push(
      candidateYears === null
        ? `Years of experience couldn’t be determined (${requiredYears}+ asked for)`
        : `${candidateYears} years of experience vs ${requiredYears}+ asked for`,
    );
  }
  const uncovered = responsibilities.evidence.filter((e) => e.status === 'MISSING').length;
  if (uncovered > 0) {
    gaps.push(
      `${uncovered} of ${responsibilities.evidence.length} responsibilities aren’t clearly reflected`,
    );
  }
  if (education.evidence.met === false && education.score === 0)
    gaps.push('Education requirement not shown');

  return {
    overallScore,
    level: matchLevel(overallScore),
    scores,
    strengths,
    gaps,
    evidence: {
      skills: skills.evidence,
      experience: experience.evidence,
      responsibilities: responsibilities.evidence,
      projects: projects.evidence,
      education: education.evidence,
      keywords: keywords.evidence,
    },
  };
}
