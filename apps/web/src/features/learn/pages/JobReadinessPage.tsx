import type { JobSkillReadiness, SkillCorrection } from '@job-assist/shared';
import { Briefcase } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Select } from '../../../shared/ui/Select';
import { useResumeList } from '../../resumes/hooks/useResumes';
import { BASIS_LABELS } from '../components/basis';
import { LearnNav } from '../components/LearnNav';
import { useAnalysedJobs, useJobReadiness } from '../hooks/useLearn';

function SkillRow({
  skill,
  correction,
  onCorrect,
}: {
  skill: JobSkillReadiness;
  correction: '' | SkillCorrection;
  onCorrect: (value: '' | SkillCorrection) => void;
}) {
  const a = skill.assessment;
  const basis = a ? BASIS_LABELS[a.basis] : null;
  return (
    <li>
      <article aria-label={skill.name} className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{skill.name}</h3>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={skill.importance === 'REQUIRED' ? 'primary' : 'neutral'}>
              {skill.importance === 'REQUIRED' ? 'Required by the job' : 'Preferred by the job'}
            </Badge>
            <Badge>
              {skill.jobSource === 'EXPLICIT'
                ? 'Stated in the posting'
                : 'Inferred from the description'}
            </Badge>
            {basis ? (
              <Badge tone={basis.tone}>{basis.label}</Badge>
            ) : (
              <Badge tone="warning">Not in the skill catalogue</Badge>
            )}
            {a?.gap ? <Badge tone="warning">To learn or practise</Badge> : null}
          </div>
        </div>
        {a ? (
          <p className="mt-2 text-sm">
            {a.proficiency.level === 'UNKNOWN' ? 'Proficiency unknown. ' : ''}
            <span className="text-muted">{a.uncertainty}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            JobAssist has no course or practice for this skill yet, so it cannot be linked or
            assessed.
          </p>
        )}
        {skill.skillId ? (
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <h4 className="font-medium">Learn</h4>
              {skill.lessons.length || skill.courses.length ? (
                <ul className="mt-1 space-y-0.5">
                  {skill.lessons.map((l) => (
                    <li key={l.lessonId}>
                      <Link
                        to={`/learn/courses/${l.courseId}/lessons/${l.lessonId}`}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {l.lessonTitle}
                      </Link>
                    </li>
                  ))}
                  {skill.courses
                    .filter((c) => c.status === 'PLANNED')
                    .map((c) => (
                      <li key={c.id} className="text-muted">
                        {c.title} (planned course)
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted">No lessons yet.</p>
              )}
            </div>
            <div>
              <h4 className="font-medium">Practise</h4>
              <ul className="mt-1 space-y-0.5">
                {skill.interviewQuestionCount ? (
                  <li>
                    <Link
                      to={`/learn/interview?skill=${skill.skillId}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {skill.interviewQuestionCount} interview practice{' '}
                      {skill.interviewQuestionCount === 1 ? 'question' : 'questions'}
                    </Link>
                  </li>
                ) : null}
                {skill.projectChallenges.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/learn/projects/${p.id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Project: {p.title}
                    </Link>
                  </li>
                ))}
                {!skill.interviewQuestionCount && !skill.projectChallenges.length ? (
                  <li className="text-muted">No practice for this skill yet.</li>
                ) : null}
              </ul>
            </div>
          </div>
        ) : null}
        {skill.skillId ? (
          <label className="mt-3 block max-w-xs text-sm">
            <span className="mb-1 block font-medium">Correct this skill</span>
            <Select
              value={correction}
              onChange={(e) => onCorrect(e.target.value as '' | SkillCorrection)}
            >
              <option value="">Use the evidence</option>
              <option value="HAS_SKILL">I have this skill</option>
              <option value="LACKS_SKILL">I don’t have this skill yet</option>
            </Select>
          </label>
        ) : null}
      </article>
    </li>
  );
}

export function JobReadinessPage() {
  const jobs = useAnalysedJobs();
  const resumes = useResumeList({ status: 'ACTIVE' });
  const readiness = useJobReadiness();
  const [jobId, setJobId] = useState('');
  const [resumeVersionId, setResumeVersionId] = useState('');
  const [corrections, setCorrections] = useState<Record<string, SkillCorrection>>({});
  const [dirty, setDirty] = useState(false);

  const run = (e?: FormEvent) => {
    e?.preventDefault();
    if (!jobId || readiness.isPending) return;
    readiness.mutate(
      {
        jobId,
        ...(resumeVersionId ? { resumeVersionId } : {}),
        corrections: Object.entries(corrections).map(([skillId, status]) => ({ skillId, status })),
      },
      { onSuccess: () => setDirty(false) },
    );
  };
  const resumeOptions = (resumes.data ?? []).flatMap((r) =>
    r.currentVersion
      ? [
          {
            id: r.currentVersion.id,
            label: `${r.name} (version ${r.currentVersion.versionNumber})`,
          },
        ]
      : [],
  );
  const result = readiness.data;

  return (
    <>
      <PageHeader
        title="Job readiness"
        subtitle="Compare one of your analysed jobs with your skill evidence, then jump to lessons, projects and interview practice for the gaps."
      />
      <LearnNav />
      {jobs.isPending ? (
        <LoadingState label="Loading your analysed jobs" />
      ) : jobs.isError ? (
        <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />
      ) : jobs.data.jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No analysed jobs yet"
          description="Job readiness uses jobs you have added and analysed — it never invents listings. Add a job posting to compare it with your skills, or keep learning without one."
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/jobs/new" className={buttonClasses()}>
              Add a job posting
            </Link>
            <Link to="/learn" className={buttonClasses('secondary')}>
              Keep learning
            </Link>
          </div>
        </EmptyState>
      ) : (
        <>
          <Card className="mb-6">
            <form
              onSubmit={run}
              aria-label="Compare a job"
              className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
            >
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Analysed job</span>
                <Select
                  required
                  value={jobId}
                  onChange={(e) => {
                    setJobId(e.target.value);
                    setCorrections({});
                  }}
                >
                  <option value="">Choose a job</option>
                  {jobs.data.jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} — {j.companyName}
                      {j.isSampleData ? ' (sample data)' : ''}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Resume</span>
                <Select
                  value={resumeVersionId}
                  onChange={(e) => setResumeVersionId(e.target.value)}
                >
                  <option value="">The resume chosen for the job, or none</option>
                  {resumeOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </label>
              <Button type="submit" disabled={!jobId} loading={readiness.isPending}>
                Compare
              </Button>
            </form>
            {readiness.isError ? (
              <div className="mt-3">
                <Alert>{errorMessage(readiness.error)}</Alert>
              </div>
            ) : null}
          </Card>

          <p role="status" aria-live="polite" className="sr-only">
            {result
              ? `Comparison ready: ${result.counts.requested} skills requested, ${result.counts.toPractise} to learn or practise.`
              : ''}
          </p>
          {result ? (
            <div className="space-y-6">
              <Card>
                <CardHeader title={`${result.job.title} — ${result.job.companyName}`} />
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  {[
                    ['Skills requested', result.counts.requested],
                    ['Measured by a diagnostic', result.counts.measured],
                    ['From your resume', result.counts.resumeEvidence],
                    ['You corrected', result.counts.userCorrected],
                    ['Unknown', result.counts.unknown],
                    ['Not in the skill catalogue', result.counts.notCatalogued],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex justify-between gap-2 border-b border-border py-1"
                    >
                      <dt className="text-muted">{label}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-sm">
                  {result.counts.toPractise} of {result.counts.requested} skills are worth learning
                  or practising. These are separate counts, not a score.
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
                  {result.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </Card>
              <section aria-labelledby="job-skills">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 id="job-skills" className="text-base font-semibold">
                    Skills in this job
                  </h2>
                  {dirty ? (
                    <Button size="sm" loading={readiness.isPending} onClick={() => run()}>
                      Update with my corrections
                    </Button>
                  ) : null}
                </div>
                {result.skills.length === 0 ? (
                  <p className="text-sm text-muted">No skills were extracted from this posting.</p>
                ) : (
                  <ul className="space-y-3">
                    {result.skills.map((s) => (
                      <SkillRow
                        key={`${s.skillId ?? s.name}`}
                        skill={s}
                        correction={s.skillId ? (corrections[s.skillId] ?? '') : ''}
                        onCorrect={(value) => {
                          if (!s.skillId) return;
                          const id = s.skillId;
                          setCorrections((c) => {
                            const next = { ...c };
                            if (value) next[id] = value;
                            else delete next[id];
                            return next;
                          });
                          setDirty(true);
                        }}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
