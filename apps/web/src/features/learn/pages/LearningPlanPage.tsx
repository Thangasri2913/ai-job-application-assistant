import {
  LEARNING_ROLES,
  LEARNING_ROLE_LABELS,
  type LearningRecommendationResponse,
  type LearningRole,
  type ResumeEvidenceKind,
  type SkillAssessment,
  type SkillCorrection,
  SKILL_JUDGEMENT_BASES,
} from '@job-assist/shared';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { formatDay } from '../../../shared/ui/format';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Select } from '../../../shared/ui/Select';
import { useResumeList } from '../../resumes/hooks/useResumes';
import { courseStats } from '../format';
import { BASIS_LABELS } from '../components/basis';
import { LearnNav } from '../components/LearnNav';
import { useLearningRecommendations } from '../hooks/useLearn';

const EVIDENCE_KIND_LABELS: Record<ResumeEvidenceKind, string> = {
  SKILLS_SECTION: 'Skills section',
  EXPERIENCE: 'Experience',
  PROJECT: 'Project',
  SUMMARY: 'Summary',
};

const STRENGTH_LABELS: Record<SkillAssessment['evidenceStrength'], string> = {
  NONE: 'Not found in resume',
  LISTED: 'Listed only',
  APPLIED: 'Used in experience or a project',
};

const PROFICIENCY_LABELS: Record<SkillAssessment['proficiency']['level'], string> = {
  UNKNOWN: 'Proficiency unknown',
  FOUNDATIONS_DEMONSTRATED: 'Fundamentals demonstrated in a diagnostic',
  FOUNDATIONS_DEVELOPING: 'Fundamentals still developing (diagnostic)',
};

type CorrectionChoice = '' | SkillCorrection;

function SkillItem({
  skill,
  correction,
  onCorrect,
}: {
  skill: SkillAssessment;
  correction: CorrectionChoice;
  onCorrect: (value: CorrectionChoice) => void;
}) {
  const headingId = `skill-${skill.skillId}`;
  return (
    <li>
      <article
        aria-labelledby={headingId}
        className="rounded-xl border border-border bg-surface p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={headingId} className="font-semibold">
            {skill.name}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {skill.coreForRole ? (
              <Badge tone="primary">Core for role</Badge>
            ) : (
              <Badge>Also in your resume</Badge>
            )}
            <Badge tone={BASIS_LABELS[skill.basis].tone}>{BASIS_LABELS[skill.basis].label}</Badge>
            {skill.coreForRole ? (
              skill.gap ? (
                <Badge tone="warning">To learn or practise</Badge>
              ) : (
                <Badge>No gap for now</Badge>
              )
            ) : null}
          </div>
        </div>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">Resume evidence</dt>
          <dd>{STRENGTH_LABELS[skill.evidenceStrength]}</dd>
          <dt className="text-muted">Proficiency</dt>
          <dd>
            {PROFICIENCY_LABELS[skill.proficiency.level]}
            <span className="block text-xs text-muted">{skill.proficiency.basis}</span>
          </dd>
          <dt className="text-muted">Confidence</dt>
          <dd>
            {skill.confidence.charAt(0) + skill.confidence.slice(1).toLowerCase()}
            <span className="block text-xs text-muted">{skill.uncertainty}</span>
          </dd>
        </dl>
        {skill.resumeEvidence.length ? (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-primary">
              Show what your resume says ({skill.resumeEvidence.length})
            </summary>
            <ul className="mt-1.5 space-y-1.5">
              {skill.resumeEvidence.map((e) => (
                <li
                  key={`${e.kind}-${e.excerpt}`}
                  className="rounded bg-surface-muted px-2.5 py-1.5"
                >
                  <span className="text-xs font-medium text-muted">
                    {EVIDENCE_KIND_LABELS[e.kind]}
                    {e.context ? ` · ${e.context}` : ''}
                  </span>
                  <span className="block">“{e.excerpt}”</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm">
            <span className="font-medium">Next step: </span>
            {skill.nextStep.courseId && skill.nextStep.kind !== 'NO_COURSE_YET' ? (
              <Link
                to={
                  skill.nextStep.kind === 'TAKE_DIAGNOSTIC'
                    ? `/learn/courses/${skill.nextStep.courseId}/diagnostic`
                    : `/learn/courses/${skill.nextStep.courseId}`
                }
                className="text-primary underline-offset-2 hover:underline"
              >
                {skill.nextStep.text}
              </Link>
            ) : (
              skill.nextStep.text
            )}
          </p>
          <label className="block min-w-56 text-sm">
            <span className="mb-1 block font-medium">Correct this skill</span>
            <Select
              value={correction}
              onChange={(e) => onCorrect(e.target.value as CorrectionChoice)}
              aria-describedby={headingId}
            >
              <option value="">Use the evidence above</option>
              <option value="HAS_SKILL">I have this skill</option>
              <option value="LACKS_SKILL">I don’t have this skill yet</option>
            </Select>
          </label>
        </div>
      </article>
    </li>
  );
}

function Evidence({ result }: { result: LearningRecommendationResponse }) {
  const { demand, role } = result;
  return (
    <section aria-labelledby="evidence" className="grid gap-4 md:grid-cols-2">
      <h2 id="evidence" className="sr-only">
        Evidence behind this plan
      </h2>
      <Card>
        <CardHeader title={`Core skills for ${role.label}`} description="Curated list" />
        <ul className="flex flex-wrap gap-1.5">
          {role.coreSkills.map((s) => (
            <li key={s.id}>
              <Badge>{s.name}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">{role.evidence.basis}</p>
        <p className="mt-1 text-sm text-muted">{role.evidence.limitations}</p>
      </Card>
      <Card>
        <CardHeader
          title="Skills in your analysed jobs"
          description="Observed, from your own job list"
        />
        {demand.jobCount > 0 ? (
          <>
            <p className="mb-2 text-sm">
              {demand.jobCount} analysed {demand.jobCount === 1 ? 'posting' : 'postings'} matching
              this role
              {demand.observedFrom
                ? `, analysed ${formatDay(demand.observedFrom)}${demand.observedTo && demand.observedTo !== demand.observedFrom ? ` – ${formatDay(demand.observedTo)}` : ''}`
                : ''}
              .
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-72 text-left text-sm">
                <caption className="sr-only">
                  Skills required or preferred in your analysed jobs
                </caption>
                <thead className="text-xs text-muted">
                  <tr>
                    <th scope="col" className="py-1 font-medium">
                      Skill
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      Postings
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      Required
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      Preferred
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {demand.skills.map((s) => (
                    <tr key={s.name} className="border-t border-border">
                      <td className="py-1">{s.name}</td>
                      <td className="py-1">{s.postings}</td>
                      <td className="py-1">{s.requiredIn}</td>
                      <td className="py-1">{s.preferredIn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm">
            No analysed jobs match this role yet.{' '}
            <Link to="/jobs/new" className="text-primary underline-offset-2 hover:underline">
              Add and analyse a job posting
            </Link>{' '}
            to compare this plan with real requirements.
          </p>
        )}
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
          {demand.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

export function LearningPlanPage() {
  const resumes = useResumeList({ status: 'ACTIVE' });
  const recommend = useLearningRecommendations();
  const [role, setRole] = useState<LearningRole | ''>('');
  const [resumeVersionId, setResumeVersionId] = useState('');
  const [corrections, setCorrections] = useState<Record<string, SkillCorrection>>({});
  const [dirty, setDirty] = useState(false);

  const options = (resumes.data ?? []).flatMap((r) =>
    r.currentVersion
      ? [
          {
            id: r.currentVersion.id,
            label: `${r.name} (version ${r.currentVersion.versionNumber})`,
          },
        ]
      : [],
  );

  const run = (e?: FormEvent) => {
    e?.preventDefault();
    if (!role) return;
    recommend.mutate(
      {
        role,
        ...(resumeVersionId ? { resumeVersionId } : {}),
        corrections: Object.entries(corrections).map(([skillId, status]) => ({ skillId, status })),
      },
      { onSuccess: () => setDirty(false) },
    );
  };

  const correct = (skillId: string, value: CorrectionChoice) => {
    setCorrections((c) => {
      const next = { ...c };
      if (value) next[skillId] = value;
      else delete next[skillId];
      return next;
    });
    setDirty(true);
  };

  const result = recommend.data;
  return (
    <>
      <PageHeader
        title="Personalised plan"
        subtitle="Compare a resume with a target role, review the skills found, and get a suggested learning sequence."
      />
      <LearnNav />

      <Card className="mb-6">
        <form
          onSubmit={run}
          aria-label="Build a learning plan"
          className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Target role</span>
            <Select
              required
              value={role}
              onChange={(e) => {
                setRole(e.target.value as LearningRole);
                setCorrections({});
              }}
            >
              <option value="">Choose a role</option>
              {LEARNING_ROLES.map((r) => (
                <option key={r} value={r}>
                  {LEARNING_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Resume</span>
            <Select
              value={resumeVersionId}
              onChange={(e) => {
                setResumeVersionId(e.target.value);
                setCorrections({});
              }}
              disabled={resumes.isPending}
            >
              <option value="">Plan without a resume</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit" loading={recommend.isPending} disabled={!role}>
            Build my plan
          </Button>
        </form>
        <p className="mt-3 text-sm text-muted">
          Your resume is read only by JobAssist to find skill evidence; it is not changed, not sent
          to an AI service and the analysis is not stored.{' '}
          {options.length === 0 && !resumes.isPending ? (
            <>
              No reviewed resume yet?{' '}
              <Link to="/resumes" className="text-primary underline-offset-2 hover:underline">
                Upload one in the resume library
              </Link>
              .
            </>
          ) : null}
        </p>
        {recommend.isError ? (
          <div className="mt-3">
            <Alert>{errorMessage(recommend.error)}</Alert>
          </div>
        ) : null}
      </Card>

      <p role="status" aria-live="polite" className="sr-only">
        {result
          ? `Plan ready for ${result.role.label}: ${result.courses.length} suggested ${result.courses.length === 1 ? 'course' : 'courses'}, ${result.skills.filter((s) => s.gap).length} skills to learn or practise.`
          : ''}
      </p>
      {result ? (
        <div className="space-y-8" aria-busy={recommend.isPending}>
          <section aria-labelledby="plan-courses">
            <h2 id="plan-courses" className="mb-3 text-base font-semibold">
              Suggested learning sequence
            </h2>
            {result.courses.length ? (
              <ol className="space-y-3">
                {result.courses.map((r) => (
                  <li
                    key={r.course.id}
                    className="flex gap-3 rounded-xl border border-border bg-surface p-4"
                  >
                    <span
                      aria-hidden
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
                    >
                      {r.order}
                    </span>
                    <div>
                      <Link
                        to={`/learn/courses/${r.course.id}`}
                        className="font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        {r.course.title}
                      </Link>
                      {r.progress !== 'NOT_STARTED' ? (
                        <Badge
                          className="ml-2"
                          tone={r.progress === 'COMPLETED' ? 'success' : 'neutral'}
                        >
                          {r.progress === 'COMPLETED' ? 'Completed' : 'In progress'}
                        </Badge>
                      ) : null}
                      <p className="text-sm">{r.reason}</p>
                      <p className="text-xs text-muted">{courseStats(r.course)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">
                No published course covers the remaining gaps. Check the next steps below for
                planned courses.
              </p>
            )}
          </section>

          <section aria-labelledby="plan-skills">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="plan-skills" className="text-base font-semibold">
                Skills {result.resume ? `in ${result.resume.resumeName}` : ''} for{' '}
                {result.role.label}
              </h2>
              {dirty ? (
                <Button size="sm" onClick={() => run()} loading={recommend.isPending}>
                  Update plan with my corrections
                </Button>
              ) : null}
            </div>
            <h3 className="mb-1.5 text-sm font-semibold">What the labels mean</h3>
            <dl className="mb-3 grid gap-x-4 gap-y-1 rounded-lg bg-surface-muted p-3 text-sm sm:grid-cols-[auto_1fr]">
              {SKILL_JUDGEMENT_BASES.map((b) => (
                <div key={b} className="contents">
                  <dt className="font-medium">{BASIS_LABELS[b].label}</dt>
                  <dd className="text-muted">{BASIS_LABELS[b].help}</dd>
                </div>
              ))}
            </dl>
            <ul className="space-y-3">
              {result.skills.map((skill) => (
                <SkillItem
                  key={skill.skillId}
                  skill={skill}
                  correction={corrections[skill.skillId] ?? ''}
                  onCorrect={(value) => correct(skill.skillId, value)}
                />
              ))}
            </ul>
          </section>

          <Evidence result={result} />

          <Card>
            <CardHeader title="How to read this plan" />
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {result.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </>
  );
}
