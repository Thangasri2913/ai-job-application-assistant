import { BookOpen } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { formatDay } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { ProgressBar } from '../../../shared/ui/ProgressBar';
import { LearnNav } from '../components/LearnNav';
import { minutes } from '../format';
import { useLearningDashboard } from '../hooks/useLearn';
import { AnalyticsSection } from '../components/AnalyticsSection';
import { NextStepsCard } from '../components/NextStepsCard';
import { PreferencesCard } from '../components/PreferencesCard';
import { ReadinessSections } from '../components/ReadinessSections';

export function MyLearningPage() {
  const query = useLearningDashboard();
  return (
    <>
      <PageHeader
        title="My learning"
        subtitle="What to do next and why, your courses, what to revise and your learning so far. Progress is saved to your account."
      />
      <LearnNav />
      {query.isPending ? (
        <LoadingState label="Loading your learning" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-6">
          {query.data.courses.length === 0 &&
          query.data.readiness.projects.length === 0 &&
          query.data.readiness.interview.attempts === 0 ? (
            <Card>
              <EmptyState
                icon={BookOpen}
                title="You have not started any courses yet"
                description="Pick a course from the catalogue, or get a personalised plan from your resume. Neither a resume nor a target role is required."
              >
                <div className="flex flex-wrap justify-center gap-2">
                  <Link to="/learn" className={buttonClasses()}>
                    Browse courses
                  </Link>
                  <Link to="/learn/plan" className={buttonClasses('secondary')}>
                    Get a personalised plan
                  </Link>
                </div>
              </EmptyState>
            </Card>
          ) : null}

          <NextStepsCard />
          {query.data.courses.length ? (
            <p className="text-sm text-muted">
              About {minutes(query.data.remainingMinutes)} of lessons left across your courses.
            </p>
          ) : null}

          {query.data.courses.length ? (
            <section aria-labelledby="my-courses">
              <h2 id="my-courses" className="mb-3 text-base font-semibold">
                Courses
              </h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {query.data.courses.map(({ course, progress }) => {
                  const done = progress.completedLessonIds.length;
                  return (
                    <li key={course.id}>
                      <Card aria-labelledby={`my-${course.id}`} className="h-full">
                        <h3 id={`my-${course.id}`} className="font-semibold">
                          <Link
                            to={`/learn/courses/${course.id}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {course.title}
                          </Link>
                        </h3>
                        <p className="mb-2 mt-1 text-sm text-muted">
                          {done} of {progress.lessonCount} lessons marked complete ·{' '}
                          {minutes(progress.remainingMinutes)} left
                        </p>
                        <ProgressBar
                          value={progress.lessonCount ? (done / progress.lessonCount) * 100 : 0}
                          label={`${course.title} lessons completed`}
                        />
                        {progress.latestDiagnostic ? (
                          <p className="mt-2 text-sm">
                            Diagnostic: {progress.latestDiagnostic.score}/
                            {progress.latestDiagnostic.maxScore} on{' '}
                            {formatDay(progress.latestDiagnostic.completedAt.slice(0, 10))}
                          </p>
                        ) : course.hasDiagnostic ? (
                          <Link
                            to={`/learn/courses/${course.id}/diagnostic`}
                            className="mt-2 inline-block text-sm text-primary underline-offset-2 hover:underline"
                          >
                            Take the diagnostic
                          </Link>
                        ) : null}
                        {progress.nextLesson ? (
                          <p className="mt-2 text-sm">
                            Next:{' '}
                            <Link
                              to={`/learn/courses/${course.id}/lessons/${progress.nextLesson.lessonId}`}
                              className="text-primary underline-offset-2 hover:underline"
                            >
                              {progress.nextLesson.lessonTitle}
                            </Link>
                          </p>
                        ) : (
                          <p className="mt-2 text-sm text-success">All lessons marked complete.</p>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader
                title="To revise"
                description="Activities whose last answer was incorrect"
              />
              {query.data.revision.length ? (
                <ul className="space-y-2 text-sm">
                  {query.data.revision.map((item) => (
                    <li key={`${item.courseId}/${item.activityId}`}>
                      <Link
                        to={`/learn/courses/${item.courseId}/lessons/${item.lessonId}#activity-${item.activityId}`}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {item.lessonTitle}
                      </Link>
                      <span className="block text-muted">{item.prompt}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nothing to revise right now.</p>
              )}
            </Card>
            <Card>
              <CardHeader title="Assessed skills" description="From diagnostics only" />
              {query.data.assessedSkills.length ? (
                <ul className="space-y-1.5 text-sm">
                  {query.data.assessedSkills.map((s) => (
                    <li key={s.skillId} className="flex justify-between gap-2">
                      <span>{s.name}</span>
                      <span className="text-right text-muted">
                        {s.correct}/{s.total} on {formatDay(s.assessedAt.slice(0, 10))}
                        {s.sufficient ? null : (
                          <span className="block text-xs">Too few questions to measure</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">
                  No assessments yet. Completing lessons does not count as skill evidence; take a
                  course diagnostic to record some.
                </p>
              )}
            </Card>
          </div>
          <ReadinessSections readiness={query.data.readiness} />
          <AnalyticsSection analytics={query.data.analytics} />
          <PreferencesCard />
        </div>
      )}
    </>
  );
}
