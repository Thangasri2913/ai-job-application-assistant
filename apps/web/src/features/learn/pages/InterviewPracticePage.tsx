import {
  type InterviewPracticeQuery,
  LEARNING_DIFFICULTIES,
  LEARNING_DIFFICULTY_LABELS,
  LEARNING_ROLE_LABELS,
  LEARNING_ROLES,
  type LearningDifficulty,
  type LearningRole,
} from '@job-assist/shared';
import { MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Select } from '../../../shared/ui/Select';
import { LearnNav } from '../components/LearnNav';
import { useCourseCatalogue, useInterviewQuestions, useLearningSkills } from '../hooks/useLearn';

export function InterviewPracticePage() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState<InterviewPracticeQuery>(() => ({
    ...(params.get('courseId') ? { courseId: params.get('courseId')! } : {}),
    ...(params.get('skill') ? { skill: params.get('skill')! } : {}),
  }));
  const questions = useInterviewQuestions(query);
  const skills = useLearningSkills();
  const courses = useCourseCatalogue({ status: 'PUBLISHED' });
  const practisedSkills = new Set(questions.data?.questions.map((q) => q.skill.id));
  const set = <K extends keyof InterviewPracticeQuery>(key: K, value: string) =>
    setQuery((q) => ({ ...q, [key]: (value || undefined) as InterviewPracticeQuery[K] }));
  const filtered = Object.values(query).some(Boolean);
  const list = questions.data?.questions ?? [];

  return (
    <>
      <PageHeader
        title="Interview practice"
        subtitle="Answer one question at a time in writing and get structured practice feedback on the key concepts, clarity and length."
      />
      <LearnNav />
      <p className="mb-6 rounded-lg bg-surface-muted px-3.5 py-3 text-sm text-muted">
        These are general practice questions written for JobAssist, not questions from any employer.
        Feedback comes from a keyword-based rubric: it can miss correct points phrased differently
        and does not predict how a real interview will go.
      </p>

      <Card className="mb-6">
        <form
          aria-label="Filter interview questions"
          className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-end"
          onSubmit={(e) => e.preventDefault()}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Role</span>
            <Select
              value={query.role ?? ''}
              onChange={(e) => set('role', e.target.value as LearningRole)}
            >
              <option value="">Any role</option>
              {LEARNING_ROLES.map((r) => (
                <option key={r} value={r}>
                  {LEARNING_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Skill</span>
            <Select value={query.skill ?? ''} onChange={(e) => set('skill', e.target.value)}>
              <option value="">Any skill</option>
              {(skills.data?.skills ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Course</span>
            <Select value={query.courseId ?? ''} onChange={(e) => set('courseId', e.target.value)}>
              <option value="">Any course</option>
              {(courses.data?.courses ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Difficulty</span>
            <Select
              value={query.difficulty ?? ''}
              onChange={(e) => set('difficulty', e.target.value as LearningDifficulty)}
            >
              <option value="">Any level</option>
              {LEARNING_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {LEARNING_DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </Select>
          </label>
          {filtered ? (
            <Button type="button" variant="ghost" onClick={() => setQuery({})}>
              Clear filters
            </Button>
          ) : null}
        </form>
      </Card>

      {questions.isPending ? (
        <LoadingState label="Loading questions" />
      ) : questions.isError ? (
        <ErrorState error={questions.error} onRetry={() => void questions.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No practice questions match"
          description="There are no questions for this combination yet. Try another skill or level."
        >
          <Button variant="secondary" onClick={() => setQuery({})}>
            Clear filters
          </Button>
        </EmptyState>
      ) : (
        <section aria-labelledby="question-list">
          <h2 id="question-list" className="mb-3 text-base font-semibold">
            {list.length} {list.length === 1 ? 'question' : 'questions'}
            {practisedSkills.size
              ? ` across ${practisedSkills.size} ${practisedSkills.size === 1 ? 'skill' : 'skills'}`
              : ''}
          </h2>
          <ul className="space-y-3">
            {list.map((q) => (
              <li key={q.id}>
                <article
                  aria-labelledby={`q-${q.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap gap-1.5">
                      <Badge tone="primary">{q.skill.name}</Badge>
                      <Badge>{LEARNING_DIFFICULTY_LABELS[q.difficulty]}</Badge>
                      {q.attempts ? (
                        <Badge tone="success">
                          {q.attempts} {q.attempts === 1 ? 'attempt' : 'attempts'}
                        </Badge>
                      ) : null}
                    </div>
                    <h3 id={`q-${q.id}`} className="text-sm font-medium">
                      {q.prompt}
                    </h3>
                  </div>
                  <Link
                    to={`/learn/interview/${q.id}`}
                    className={buttonClasses(q.attempts ? 'secondary' : 'primary', 'sm')}
                    aria-label={`${q.attempts ? 'Practise again' : 'Practise'}: ${q.prompt}`}
                  >
                    {q.attempts ? 'Practise again' : 'Practise'}
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
