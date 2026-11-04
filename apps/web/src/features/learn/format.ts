import type { CourseSummary, ProjectStatus } from '@job-assist/shared';

/** "45 min", "1 h 20 min", "2 h". */
export function minutes(value: number): string {
  if (value < 60) return `${value} min`;
  const h = Math.floor(value / 60);
  const m = value % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function courseStats(course: CourseSummary): string {
  if (course.status === 'PLANNED') return 'Curriculum in preparation';
  const parts = [`${course.lessonCount} lessons`];
  if (course.activityCount) parts.push(`${course.activityCount} activities`);
  if (course.estimatedHours !== null) parts.push(`about ${course.estimatedHours} hours`);
  return parts.join(' · ');
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed (self-reported)',
};
