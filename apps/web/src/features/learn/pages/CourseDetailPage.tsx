import {
  COURSE_FORMAT_LABELS,
  type CourseDetail,
  type CourseProgress,
  LEARNING_CATEGORY_LABELS,
  LEARNING_DIFFICULTY_LABELS,
  LEARNING_MODULE_KIND_LABELS,
  LEARNING_ROLE_LABELS,
  type LearningModule,
  SKILL_LEVEL_LABELS,
} from '@job-assist/shared';
import { CircleCheck, GraduationCap } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiError, errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { formatDay } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { ProgressBar } from '../../../shared/ui/ProgressBar';
import { ContentNotice } from '../components/ContentNotice';
import { LevelBadge } from '../components/LevelBadge';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { CoursePractice } from '../components/CoursePractice';
import { useCourse, useCourseCatalogue, useCourseProgress, useEnrollment } from '../hooks/useLearn';
import { minutes } from '../format';
import { BackLink, NotFound, TextList } from '../components/LearnCommon';

function ProgressPanel({
  course,
  progress,
  loading,
}: {
  course: CourseDetail;
  progress?: CourseProgress;
  loading: boolean;
}) {
  const { enroll, unenroll } = useEnrollment(course.id);
  const enrolled = progress?.enrolled ?? false;
  const done = progress?.completedLessonIds.length ?? 0;
  const next = progress?.nextLesson;
  const error = enroll.error ?? unenroll.error;
  return (
    <Card className="mb-6" aria-label="Your progress">
      <div className="flex flex-wrap items-center gap-3">
        {loading ? (
          <span className="text-sm text-muted">Loading your progress…</span>
        ) : enrolled ? (
          <>
            <Badge tone="success">In my learning</Badge>
            <Button
              variant="ghost"
              size="sm"
              loading={unenroll.isPending}
              onClick={() => unenroll.mutate()}
            >
              Remove from my learning
            </Button>
          </>
        ) : (
          <Button loading={enroll.isPending} onClick={() => enroll.mutate()}>
            Add to my learning
          </Button>
        )}
        {next ? (
          <Link
            to={`/learn/courses/${course.id}/lessons/${next.lessonId}`}
            className={buttonClasses(
              enrolled ? 'primary' : 'secondary',
              'md',
              'h-auto! min-h-10 py-2 text-left',
            )}
          >
            {done > 0 ? `Continue: ${next.lessonTitle}` : 'Start the first lesson'}
          </Link>
        ) : null}
        {course.hasDiagnostic ? (
          <Link
            to={`/learn/courses/${course.id}/diagnostic`}
            className={buttonClasses('secondary')}
          >
            {progress?.latestDiagnostic ? 'Retake the diagnostic' : 'Take the diagnostic'}
          </Link>
        ) : null}
      </div>
      {course.hasDiagnostic && !progress?.latestDiagnostic ? (
        <p className="mt-2 text-sm text-muted">
          Already know some of this? A short diagnostic suggests which lessons you can skim.
        </p>
      ) : null}
      {progress?.latestDiagnostic ? (
        <p className="mt-2 text-sm text-muted">
          Latest diagnostic: {progress.latestDiagnostic.score} of{' '}
          {progress.latestDiagnostic.maxScore} correct on{' '}
          {formatDay(progress.latestDiagnostic.completedAt.slice(0, 10))}.
        </p>
      ) : null}
      {enrolled || done > 0 ? (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-sm">
            <span>
              {done} of {course.lessonCount} lessons marked complete
            </span>
            <span className="text-muted">{minutes(progress?.remainingMinutes ?? 0)} left</span>
          </div>
          <ProgressBar
            value={course.lessonCount ? (done / course.lessonCount) * 100 : 0}
            label="Lessons completed"
          />
        </div>
      ) : null}
      {error ? (
        <div className="mt-3">
          <Alert>{errorMessage(error)}</Alert>
        </div>
      ) : null}
    </Card>
  );
}

function ModuleCard({
  courseId,
  module,
  progress,
}: {
  courseId: string;
  module: LearningModule;
  progress?: CourseProgress;
}) {
  const headingId = `module-${module.id}`;
  const completed = new Set(progress?.completedLessonIds);
  const skim = new Set(progress?.skimLessonIds);
  return (
    <li>
      <Card aria-labelledby={headingId}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id={headingId} className="text-base font-semibold">
            Module {module.order}: {module.title}
          </h3>
          <div className="flex gap-1.5">
            <Badge>{LEARNING_MODULE_KIND_LABELS[module.kind]}</Badge>
            {module.estimatedMinutes > 0 ? <Badge>{minutes(module.estimatedMinutes)}</Badge> : null}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">{module.description}</p>
        {module.lessons.length > 0 ? (
          <ol aria-label={`Lessons in ${module.title}`} className="mt-4 space-y-2">
            {module.lessons.map((lesson) => (
              <li
                key={lesson.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-3"
              >
                <div>
                  <Link
                    to={`/learn/courses/${courseId}/lessons/${lesson.id}`}
                    className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Lesson {lesson.order}: {lesson.title}
                  </Link>
                  <p className="text-sm text-muted">{lesson.summary}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {completed.has(lesson.id) ? (
                    <Badge tone="success">
                      <CircleCheck className="mr-1 size-3.5" aria-hidden />
                      Completed
                    </Badge>
                  ) : skim.has(lesson.id) ? (
                    <Badge tone="primary">
                      Diagnostic suggests skimming
                      <span className="sr-only">
                        {' '}
                        — every diagnostic question on this topic was answered correctly
                      </span>
                    </Badge>
                  ) : null}
                  <LevelBadge level={lesson.level} />
                  <span className="text-xs text-muted">
                    {minutes(lesson.estimatedMinutes)}
                    {lesson.activities.length ? ` · ${lesson.activities.length} activities` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        {module.project ? (
          <div className="mt-4 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold">Project: {module.project.title}</h4>
              <span className="text-xs text-muted">
                About {module.project.estimatedHours} hours
              </span>
            </div>
            <p className="mt-1 text-sm">{module.project.brief}</p>
            <h5 className="mb-1.5 mt-3 text-sm font-semibold">Requirements</h5>
            <TextList items={module.project.requirements} />
            <div className="mt-3">
              <ProvenanceBadge provenance={module.project.provenance} />
            </div>
          </div>
        ) : null}
      </Card>
    </li>
  );
}

export function CourseDetailPage() {
  const { courseId = '' } = useParams();
  const query = useCourse(courseId);
  const published = query.data?.status === 'PUBLISHED';
  const progress = useCourseProgress(courseId, published);
  const catalogue = useCourseCatalogue({});
  const titleOf = (id: string) =>
    catalogue.data?.courses.find((c) => c.id === id)?.title ?? id.replace(/-/g, ' ');

  if (query.isPending) return <LoadingState label="Loading course" />;
  if (query.isError)
    return (
      <>
        <BackLink to="/learn" label="All courses" />
        {query.error instanceof ApiError && query.error.status === 404 ? (
          <NotFound what="Course" />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </>
    );

  const course = query.data;
  return (
    <>
      <BackLink to="/learn" label="All courses" />
      <PageHeader title={course.title} subtitle={course.description} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Badge tone="primary">{LEARNING_CATEGORY_LABELS[course.category]}</Badge>
        <Badge>{COURSE_FORMAT_LABELS[course.format]}</Badge>
        <Badge>{LEARNING_DIFFICULTY_LABELS[course.difficulty]}</Badge>
        {course.levels ? (
          <Badge>
            Levels {course.levels.from}–{course.levels.to}: {SKILL_LEVEL_LABELS[course.levels.from]}{' '}
            to {SKILL_LEVEL_LABELS[course.levels.to].toLowerCase()}
          </Badge>
        ) : null}
        {course.status === 'PLANNED' ? <Badge tone="warning">Planned</Badge> : null}
        <ProvenanceBadge provenance={course.provenance} />
        {course.lastReviewedOn ? (
          <Badge tone="success">Last reviewed {formatDay(course.lastReviewedOn)}</Badge>
        ) : null}
      </div>
      <ContentNotice />

      {published && progress.isError ? (
        <div className="mb-6">
          <Alert>
            Your progress for this course could not be loaded.{' '}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => void progress.refetch()}
            >
              Try again
            </button>
          </Alert>
        </div>
      ) : published ? (
        <ProgressPanel course={course} progress={progress.data} loading={progress.isPending} />
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="What you will achieve" />
          <TextList items={course.outcomes} />
          <h3 className="mb-1.5 mt-4 text-sm font-semibold">Relevant roles</h3>
          <p className="text-sm">{course.roles.map((r) => LEARNING_ROLE_LABELS[r]).join(', ')}</p>
        </Card>
        <Card>
          <CardHeader title="Before you start" />
          {course.prerequisites.length ? (
            <TextList items={course.prerequisites} />
          ) : (
            <p className="text-sm text-muted">No prerequisites.</p>
          )}
          {course.prerequisiteCourseIds.length ? (
            <p className="mt-2 text-sm">
              Suggested first:{' '}
              {course.prerequisiteCourseIds.map((id, i) => (
                <span key={id}>
                  {i > 0 ? ', ' : ''}
                  <Link
                    to={`/learn/courses/${id}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {titleOf(id)}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
          <h3 className="mb-1.5 mt-4 text-sm font-semibold">Skills covered</h3>
          <ul aria-label="Skills covered" className="flex flex-wrap gap-1.5">
            {course.skills.map((skill) => (
              <li key={skill.id}>
                <Badge>{skill.name}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {published ? <CoursePractice courseId={course.id} /> : null}

      {course.modules.length === 0 ? (
        <Card>
          <EmptyState
            icon={GraduationCap}
            title="Curriculum in preparation"
            description="This course is planned. Its modules and lessons have not been written yet."
          />
        </Card>
      ) : (
        <section aria-labelledby="course-curriculum">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="course-curriculum" className="text-base font-semibold">
              Curriculum
            </h2>
            <p className="text-sm text-muted">
              {course.moduleCount} modules · {course.lessonCount} lessons
              {course.estimatedHours !== null ? ` · about ${course.estimatedHours} hours` : ''}
            </p>
          </div>
          <ol className="space-y-4">
            {course.modules.map((module) => (
              <ModuleCard
                key={module.id}
                courseId={course.id}
                module={module}
                progress={progress.data}
              />
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
