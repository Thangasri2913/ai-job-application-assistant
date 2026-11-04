import type { RevisionTopic } from '@job-assist/shared';
import { CheckCircle2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { formatDate } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { ActivityCard } from '../components/ActivityCard';
import { LearnNav } from '../components/LearnNav';
import { useCourse, useRevisionQueue } from '../hooks/useLearn';

const KIND_LABELS: Record<RevisionTopic['kind'], string> = {
  PRACTICE: 'Practice mistakes',
  DIAGNOSTIC: 'Diagnostic',
  INTERVIEW: 'Interview practice',
};

const link = 'text-primary underline-offset-2 hover:underline';

/** The questions to retry for one topic, using the normal activity cards (graded on the server). */
function TopicPractice({ topic }: { topic: RevisionTopic }) {
  return topic.courseId && topic.lessonId ? (
    <LessonTopicPractice topic={topic} courseId={topic.courseId} />
  ) : (
    <div className="mt-4 border-t border-border pt-4 text-sm">
      {topic.interviewQuestionId ? (
        <Link to={`/learn/interview/${topic.interviewQuestionId}`} className={link}>
          Answer the interview question again
        </Link>
      ) : null}
    </div>
  );
}

function LessonTopicPractice({ topic, courseId }: { topic: RevisionTopic; courseId: string }) {
  const course = useCourse(courseId);
  const retry = topic.activities.filter((a) => a.status !== 'SCHEDULED');
  const lesson = course.data?.modules
    .flatMap((m) => m.lessons)
    .find((l) => l.id === topic.lessonId);
  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <p className="text-sm">
        {topic.courseId && topic.lessonId ? (
          <>
            Start by skimming the{' '}
            <Link
              to={`/learn/courses/${topic.courseId}/lessons/${topic.lessonId}#section-explanation`}
              className={link}
            >
              lesson explanation
            </Link>
            {lesson?.recap ? <> — in short: {lesson.recap}</> : null}
          </>
        ) : null}
        {topic.interviewQuestionId ? (
          <>
            {topic.courseId ? ' Then ' : ''}
            <Link to={`/learn/interview/${topic.interviewQuestionId}`} className={link}>
              answer the interview question again
            </Link>
            .
          </>
        ) : null}
      </p>
      {retry.length === 0 ? null : course.isPending ? (
        <LoadingState label="Loading questions" />
      ) : course.isError || !lesson ? (
        <p className="text-sm text-muted">
          The practice questions for this topic could not be loaded.
        </p>
      ) : (
        retry.map((item) => {
          const activity = lesson.activities.find((a) => a.id === item.activityId);
          return activity ? (
            <div key={item.activityId}>
              <p className="mb-1 text-xs text-muted">
                <Badge tone={item.status === 'DUE' ? 'warning' : 'neutral'}>
                  {item.status === 'DUE' ? 'To retry' : 'Different question'}
                </Badge>{' '}
                {item.reason}
              </p>
              <ActivityCard courseId={courseId} activity={activity} />
            </div>
          ) : null;
        })
      )}
      {topic.activities.some((a) => a.status === 'SCHEDULED') ? (
        <ul className="text-xs text-muted">
          {topic.activities
            .filter((a) => a.status === 'SCHEDULED')
            .map((a) => (
              <li key={a.activityId}>
                Later: “{a.prompt}” — {a.reason}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

function TopicCard({ topic, initiallyOpen }: { topic: RevisionTopic; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (initiallyOpen) ref.current?.focus();
  }, [initiallyOpen]);
  const headingId = `topic-${topic.key.replace(/[^a-z0-9-]/gi, '-')}`;
  return (
    <li>
      <article
        ref={ref}
        tabIndex={-1}
        aria-labelledby={headingId}
        className="rounded-xl border border-border bg-surface p-4 outline-none focus-visible:outline-2"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap gap-1.5">
              <Badge>{KIND_LABELS[topic.kind]}</Badge>
              {topic.due ? (
                <Badge tone="warning">Due now</Badge>
              ) : (
                <Badge tone="neutral">
                  Back after {topic.dueAt ? formatDate(topic.dueAt) : 'later'}
                </Badge>
              )}
              {topic.skillNames.map((s) => (
                <Badge key={s} tone="primary">
                  {s}
                </Badge>
              ))}
            </div>
            <h3 id={headingId} className="font-semibold">
              {topic.title}
            </h3>
          </div>
          {topic.due ? (
            <Button
              size="sm"
              variant={open ? 'secondary' : 'primary'}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? 'Hide practice' : 'Review this topic'}
            </Button>
          ) : null}
        </div>
        <p className="mt-2 text-sm">
          <span className="font-medium">Why it is here: </span>
          {topic.reason}
        </p>
        {open && topic.due ? <TopicPractice topic={topic} /> : null}
      </article>
    </li>
  );
}

export function RevisionPage() {
  const query = useRevisionQueue();
  const [params] = useSearchParams();
  const focus = params.get('topic');
  return (
    <>
      <PageHeader
        title="Revision"
        subtitle="Topics to review, based on your own answers. Retry the questions you missed and try different ones on the same topic."
      />
      <LearnNav />
      {query.isPending ? (
        <LoadingState label="Loading your revision list" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.topics.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing to revise right now"
          description={
            query.data.resolvedCount
              ? `You have cleared ${query.data.resolvedCount} question${query.data.resolvedCount === 1 ? '' : 's'} you once got wrong. New mistakes will appear here.`
              : 'Questions you answer incorrectly in lessons, diagnostics or interview practice will appear here.'
          }
        >
          <Link to="/learn/my-learning" className={buttonClasses('secondary')}>
            Back to My learning
          </Link>
        </EmptyState>
      ) : (
        <>
          <p className="mb-4 text-sm" role="status">
            {query.data.dueCount} {query.data.dueCount === 1 ? 'topic is' : 'topics are'} due now
            {query.data.scheduledCount ? `, ${query.data.scheduledCount} coming back later` : ''}
            {query.data.resolvedCount ? `; ${query.data.resolvedCount} cleared so far` : ''}.
          </p>
          <ul className="space-y-3">
            {query.data.topics.map((t) => (
              <TopicCard key={t.key} topic={t} initiallyOpen={t.key === focus} />
            ))}
          </ul>
        </>
      )}
      {query.data ? (
        <details className="mt-6 rounded-lg border border-border px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">How the revision list works</summary>
          <p className="mt-2 text-muted">{query.data.method}</p>
          <p className="mt-1 text-muted">
            This is a simple rule of thumb, not a scientifically tuned schedule.
          </p>
        </details>
      ) : null}
    </>
  );
}
