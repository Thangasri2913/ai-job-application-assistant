import { ArrowRight, CircleCheck } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ApiError, errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card } from '../../../shared/ui/Card';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { ActivityCard } from '../components/ActivityCard';
import { CodeBlock } from '../components/CodeBlock';
import { BackLink, NotFound, TextList } from '../components/LearnCommon';
import { LevelBadge } from '../components/LevelBadge';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { ResourceList } from '../components/ResourceList';
import { minutes } from '../format';
import { useCourse, useCourseProgress, useLessonCompletion } from '../hooks/useLearn';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `section-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="mb-3 text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function LessonPage() {
  const { courseId = '', lessonId = '' } = useParams();
  const course = useCourse(courseId);
  const published = course.data?.status === 'PUBLISHED';
  const progress = useCourseProgress(courseId, published);
  const completion = useLessonCompletion(courseId, lessonId);
  const { hash } = useLocation();
  const [announcement, setAnnouncement] = useState('');
  const ready = Boolean(course.data);

  // Links such as "To revise" point at a specific activity (#activity-…): scroll to it.
  useEffect(() => {
    if (!ready || !hash) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    target?.scrollIntoView?.({ block: 'start' });
    target?.focus?.({ preventScroll: true });
  }, [ready, hash, lessonId]);

  if (course.isPending) return <LoadingState label="Loading lesson" />;
  if (course.isError)
    return (
      <>
        <BackLink to="/learn" label="All courses" />
        {course.error instanceof ApiError && course.error.status === 404 ? (
          <NotFound what="Course" />
        ) : (
          <ErrorState error={course.error} onRetry={() => void course.refetch()} />
        )}
      </>
    );

  const lessons = course.data.modules.flatMap((m) =>
    m.lessons.map((lesson) => ({ module: m, lesson })),
  );
  const index = lessons.findIndex((l) => l.lesson.id === lessonId);
  const back = <BackLink to={`/learn/courses/${courseId}`} label={course.data.title} />;
  if (index < 0)
    return (
      <>
        {back}
        <NotFound what="Lesson" />
      </>
    );

  const { module, lesson } = lessons[index]!;
  const previous = lessons[index - 1]?.lesson;
  const next = lessons[index + 1]?.lesson;
  const completed = progress.data?.completedLessonIds.includes(lesson.id) ?? false;
  const skim = progress.data?.skimLessonIds.includes(lesson.id) ?? false;
  const attempts = new Map(progress.data?.activities.map((a) => [a.activityId, a]));
  const skimTopic = progress.data?.latestDiagnostic?.topics.find((t) => t.lessonId === lesson.id);
  const graded = lesson.activities.filter((a) =>
    ['MULTIPLE_CHOICE', 'FILL_IN_THE_GAP', 'SHORT_ANSWER'].includes(a.type),
  );
  const unanswered = graded.filter((a) => !attempts.has(a.id)).length;
  const toggleCompletion = () => {
    if (completion.isPending) return;
    completion.mutate(!completed, {
      onSuccess: () =>
        setAnnouncement(
          completed
            ? 'Lesson marked as not complete.'
            : next
              ? `Lesson marked complete. Next: ${next.title}.`
              : 'Lesson marked complete. That was the last lesson in this course.',
        ),
    });
  };
  const projectModule = course.data.modules.find((m) => m.project);

  return (
    <article aria-labelledby="lesson-title" className="max-w-3xl">
      {back}
      <p className="text-sm text-muted">
        Module {module.order}: {module.title} · Lesson {lesson.order} of {module.lessons.length}
      </p>
      <h1 id="lesson-title" className="mt-1 text-2xl font-semibold tracking-tight">
        {lesson.title}
      </h1>
      <p className="mt-1.5 text-muted">{lesson.summary}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <LevelBadge level={lesson.level} />
        <Badge>{minutes(lesson.estimatedMinutes)}</Badge>
        <ProvenanceBadge provenance={lesson.provenance} />
        {completed ? <Badge tone="success">Completed</Badge> : null}
      </div>
      {skim && !completed ? (
        <p className="mt-3 rounded-lg bg-primary-soft px-3.5 py-2.5 text-sm text-primary">
          Your diagnostic suggests skimming this lesson
          {skimTopic
            ? `: you answered ${skimTopic.correct} of ${skimTopic.total} question${skimTopic.total === 1 ? '' : 's'} on this topic correctly`
            : ''}
          . That is a short check, not proof of mastery — try the activities to confirm.
        </p>
      ) : null}
      {progress.isError ? (
        <div className="mt-3">
          <Alert>
            Your progress for this course could not be loaded, so completion and earlier attempts
            are not shown.{' '}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => void progress.refetch()}
            >
              Try again
            </button>
          </Alert>
        </div>
      ) : null}

      <Section title="You will be able to">
        <TextList items={lesson.objectives} />
      </Section>

      <Section title="Explanation">
        <div className="space-y-2 text-sm leading-relaxed">
          {lesson.explanation.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        {lesson.deepDive.length ? (
          <details className="mt-3 rounded-lg border border-border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Go deeper</summary>
            <div className="mt-2 space-y-2 text-sm leading-relaxed">
              {lesson.deepDive.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </details>
        ) : null}
      </Section>

      {lesson.examples.length ? (
        <Section title="Examples">
          <div className="space-y-4">
            {lesson.examples.map((example) => (
              <div key={example.title}>
                <h3 className="text-sm font-semibold">{example.title}</h3>
                <p className="text-sm text-muted">{example.description}</p>
                {example.code ? <CodeBlock code={example.code} /> : null}
                {example.expectedOutput ? (
                  <CodeBlock
                    code={{ language: 'text', source: example.expectedOutput }}
                    label="Expected output"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {lesson.activities.length ? (
        <Section title="Practice">
          <p className="mb-3 text-sm text-muted">
            Answers are checked by JobAssist and your attempts are saved to your account. Wrong
            answers come with an explanation — try again as often as you like.
          </p>
          <div className="space-y-3">
            {lesson.activities.map((activity) => (
              <ActivityCard
                key={activity.id}
                courseId={courseId}
                activity={activity}
                previous={attempts.get(activity.id)}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {lesson.exercises.length ? (
        <Section title="Hands-on exercise">
          {lesson.exercises.map((exercise) => (
            <Card key={exercise.id} className="mb-3">
              <h3 className="text-sm font-semibold">
                {exercise.title}{' '}
                <span className="font-normal text-muted">
                  · {minutes(exercise.estimatedMinutes)}
                </span>
              </h3>
              <p className="mt-1 text-sm">{exercise.instructions}</p>
              <p className="mt-2 text-sm font-medium">Done when</p>
              <TextList items={exercise.successCriteria} />
            </Card>
          ))}
        </Section>
      ) : null}

      {lesson.resources.length ? (
        <Section title="Curated resources">
          <ResourceList resources={lesson.resources} />
        </Section>
      ) : null}

      {lesson.recap ? (
        <Section title="Recap">
          <p className="rounded-lg bg-surface-muted px-4 py-3 text-sm">{lesson.recap}</p>
        </Section>
      ) : null}

      <Card className="mt-8" aria-label="Lesson progress">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant={completed ? 'secondary' : 'primary'}
            aria-pressed={completed}
            loading={completion.isPending}
            disabled={progress.isPending || progress.isError}
            onClick={toggleCompletion}
          >
            {completed ? (
              <>
                <CircleCheck className="size-4" aria-hidden /> Marked complete
              </>
            ) : (
              'Mark lesson complete'
            )}
          </Button>
          <div className="flex flex-wrap gap-2">
            {previous ? (
              <Link
                to={`/learn/courses/${courseId}/lessons/${previous.id}`}
                className={buttonClasses('ghost', 'md', 'h-auto! min-h-10 py-2 text-left')}
              >
                Previous: {previous.title}
              </Link>
            ) : null}
            {next ? (
              <Link
                to={`/learn/courses/${courseId}/lessons/${next.id}`}
                className={buttonClasses('secondary', 'md', 'h-auto! min-h-10 py-2 text-left')}
              >
                Next: {next.title}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <Link
                to={`/learn/courses/${courseId}`}
                className={buttonClasses('secondary', 'md', 'h-auto! min-h-10 py-2 text-left')}
              >
                {projectModule
                  ? `Next: the project — ${projectModule.project!.title}`
                  : 'Back to the course'}
              </Link>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          Marking a lesson complete records your progress. It is not an assessment of your skill.
          {!completed && unanswered > 0
            ? ` You have not answered ${unanswered} of the ${graded.length} practice ${graded.length === 1 ? 'activity' : 'activities'} yet — they are optional, but they show what you know.`
            : ''}
        </p>
        <p role="status" aria-live="polite" className="mt-2 text-sm text-success empty:hidden">
          {announcement}
        </p>
        {completion.isError ? (
          <div className="mt-3">
            <Alert>{errorMessage(completion.error)}</Alert>
          </div>
        ) : null}
      </Card>
    </article>
  );
}
