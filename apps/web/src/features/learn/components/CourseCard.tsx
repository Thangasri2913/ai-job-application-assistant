import {
  COURSE_FORMAT_LABELS,
  type CourseProgress,
  type CourseSummary,
  LEARNING_CATEGORY_LABELS,
  LEARNING_DIFFICULTY_LABELS,
} from '@job-assist/shared';
import { Link } from 'react-router';
import { Badge } from '../../../shared/ui/Badge';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { courseStats } from '../format';
import { ProvenanceBadge } from './ProvenanceBadge';

export function CourseCard({
  course,
  progress,
}: {
  course: CourseSummary;
  /** The learner's progress, when the course is in "My learning". */
  progress?: CourseProgress;
}) {
  const headingId = `course-${course.id}`;
  const planned = course.status === 'PLANNED';
  return (
    <li>
      <article
        aria-labelledby={headingId}
        className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5"
      >
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="primary">{LEARNING_CATEGORY_LABELS[course.category]}</Badge>
          <Badge>{COURSE_FORMAT_LABELS[course.format]}</Badge>
          <Badge>{LEARNING_DIFFICULTY_LABELS[course.difficulty]}</Badge>
          {planned ? <Badge tone="warning">Planned</Badge> : null}
        </div>
        <h3 id={headingId} className="text-base font-semibold">
          {course.title}
        </h3>
        <p className="text-sm text-muted">{course.description}</p>
        <p className="text-sm">{courseStats(course)}</p>
        {progress ? (
          <p className="text-sm font-medium text-success">
            In my learning · {progress.completedLessonIds.length} of {progress.lessonCount} lessons
            marked complete
          </p>
        ) : null}
        <ul aria-label="Skills" className="flex flex-wrap gap-1.5">
          {course.skills.map((skill) => (
            <li key={skill.id}>
              <Badge>{skill.name}</Badge>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <ProvenanceBadge provenance={course.provenance} />
          <Link
            to={`/learn/courses/${course.id}`}
            className={buttonClasses(planned ? 'secondary' : 'primary', 'sm')}
            aria-label={`${planned ? 'Preview' : progress ? 'Continue' : 'View'} ${course.title}`}
          >
            {planned ? 'Preview' : progress ? 'Continue' : 'View course'}
          </Link>
        </div>
      </article>
    </li>
  );
}
