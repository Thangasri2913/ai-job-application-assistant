import { type ResumeContent, SKILL_CATEGORIES, SKILL_CATEGORY_LABELS } from '@job-assist/shared';
import type { ReactNode } from 'react';
import { Badge } from '../../../shared/ui/Badge';
import { formatDateRange, formatMonth } from '../../../shared/ui/format';

const key = (...parts: (string | null)[]) =>
  parts.map((p) => (p ?? '').trim().toLowerCase()).join('|');

/** Index of what the parser extracted from the original file, to label each item's origin. */
function buildProvenance(extracted: ResumeContent | null | undefined) {
  if (!extracted) return null;
  return {
    skills: new Set(extracted.skills.map((s) => key(s.name))),
    experiences: new Set(extracted.experiences.map((e) => key(e.company, e.jobTitle))),
    educations: new Set(extracted.educations.map((e) => key(e.institution, e.degree))),
    projects: new Set(extracted.projects.map((p) => key(p.name))),
    certifications: new Set(extracted.certifications.map((c) => key(c.name))),
  };
}

function Origin({ fromFile }: { fromFile: boolean | null }) {
  if (fromFile === null) return null;
  return fromFile ? (
    <Badge className="ml-2">From your file</Badge>
  ) : (
    <Badge tone="primary" className="ml-2">
      Added by you
    </Badge>
  );
}

function Section({
  title,
  children,
  empty,
}: {
  title: string;
  children: ReactNode;
  empty: boolean;
}) {
  return (
    <section className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {empty ? <p className="text-sm text-muted">Nothing recorded.</p> : children}
    </section>
  );
}

/** Read-only rendering of a resume version's confirmed content. */
export function ResumeContentView({
  content,
  extracted,
}: {
  content: ResumeContent;
  /** Parser output for this version's file; when given, items are labelled by origin. */
  extracted?: ResumeContent | null;
}) {
  const provenance = buildProvenance(extracted);
  const origin = (set: keyof NonNullable<typeof provenance>, k: string) =>
    provenance ? provenance[set].has(k) : null;
  const c = content.contact;
  const contactLine = [c.email, c.phone, c.location].filter(Boolean).join(' · ');
  const links = [c.linkedinUrl, c.githubUrl, c.portfolioUrl].filter((v): v is string => Boolean(v));

  return (
    <div className="flex flex-col gap-4 text-sm">
      <Section title="Contact" empty={!c.fullName && !contactLine && links.length === 0}>
        {c.fullName ? <p className="font-medium">{c.fullName}</p> : null}
        {contactLine ? <p className="text-muted">{contactLine}</p> : null}
        {links.length > 0 ? (
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {links.map((link) => (
              <li key={link}>
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary hover:underline"
                >
                  {link.replace(/^https?:\/\//, '')}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Summary" empty={!content.summary && !content.headline}>
        {content.headline ? <p className="mb-1 font-medium">{content.headline}</p> : null}
        {content.summary ? <p className="whitespace-pre-line">{content.summary}</p> : null}
      </Section>

      <Section title="Skills" empty={content.skills.length === 0}>
        {provenance ? (
          <p className="mb-2 text-xs text-muted">
            Highlighted skills were added by you; the rest were found in your file.
          </p>
        ) : null}
        <div className="grid gap-2">
          {SKILL_CATEGORIES.map((category) => {
            const skills = content.skills.filter((s) => s.category === category);
            if (skills.length === 0) return null;
            return (
              <div key={category}>
                <span className="mr-2 text-muted">{SKILL_CATEGORY_LABELS[category]}:</span>
                {provenance
                  ? skills.map((s, j) => (
                      <span key={s.name}>
                        {j > 0 ? ', ' : ''}
                        <span
                          className={
                            provenance.skills.has(key(s.name))
                              ? undefined
                              : 'font-medium text-primary'
                          }
                        >
                          {s.name}
                        </span>
                      </span>
                    ))
                  : skills.map((s) => s.name).join(', ')}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Experience" empty={content.experiences.length === 0}>
        <ul className="grid gap-4">
          {content.experiences.map((e, i) => (
            <li key={i}>
              <p className="font-medium">
                {[e.jobTitle, e.company].filter(Boolean).join(' · ')}
                <Origin fromFile={origin('experiences', key(e.company, e.jobTitle))} />
              </p>
              <p className="text-muted">
                {[e.location, formatDateRange(e.startDate, e.endDate, e.isCurrent)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {[...e.responsibilities, ...e.achievements].length > 0 ? (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                  {[...e.responsibilities, ...e.achievements].map((line, j) => (
                    <li key={j}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {e.technologies.length > 0 ? (
                <p className="mt-1 text-xs text-muted">{e.technologies.join(', ')}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Education" empty={content.educations.length === 0}>
        <ul className="grid gap-2">
          {content.educations.map((e, i) => (
            <li key={i}>
              <p className="font-medium">
                {[e.degree, e.fieldOfStudy].filter(Boolean).join(', ') || e.institution}
                <Origin fromFile={origin('educations', key(e.institution, e.degree))} />
              </p>
              <p className="text-muted">
                {[
                  e.degree || e.fieldOfStudy ? e.institution : null,
                  formatDateRange(e.startDate, e.endDate),
                  e.grade,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Projects" empty={content.projects.length === 0}>
        <ul className="grid gap-3">
          {content.projects.map((p, i) => (
            <li key={i}>
              <p className="font-medium">
                {p.name}
                <Origin fromFile={origin('projects', key(p.name))} />
              </p>
              {p.description ? <p className="text-muted">{p.description}</p> : null}
              {p.highlights.length > 0 ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {p.highlights.map((h, j) => (
                    <li key={j}>{h}</li>
                  ))}
                </ul>
              ) : null}
              {p.technologies.length > 0 ? (
                <p className="mt-1 text-xs text-muted">{p.technologies.join(', ')}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Certifications" empty={content.certifications.length === 0}>
        <ul className="grid gap-1">
          {content.certifications.map((c, i) => (
            <li key={i}>
              {c.name}
              <Origin fromFile={origin('certifications', key(c.name))} />
              <span className="text-muted">
                {[c.issuer, formatMonth(c.date)]
                  .filter(Boolean)
                  .map((v) => ` · ${v}`)
                  .join('')}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Achievements" empty={content.achievements.length === 0}>
        <ul className="list-disc space-y-0.5 pl-5">
          {content.achievements.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </Section>

      <Section title="Languages" empty={content.languages.length === 0}>
        <p>{content.languages.join(', ')}</p>
      </Section>
    </div>
  );
}
