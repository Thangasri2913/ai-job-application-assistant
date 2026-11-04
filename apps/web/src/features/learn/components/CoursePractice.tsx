import { Link } from 'react-router';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { useInterviewQuestions, useProjectChallenges } from '../hooks/useLearn';

const link = 'text-primary underline-offset-2 hover:underline';

/** Interview practice and project challenges related to a course. Hidden when there are none. */
export function CoursePractice({ courseId }: { courseId: string }) {
  const questions = useInterviewQuestions({ courseId });
  const projects = useProjectChallenges(courseId);
  const questionCount = questions.data?.questions.length ?? 0;
  const challenges = projects.data?.challenges ?? [];
  if (!questionCount && !challenges.length) return null;
  return (
    <Card className="mb-6">
      <CardHeader title="Practise what you learn" />
      <ul className="space-y-1.5 text-sm">
        {questionCount ? (
          <li>
            <Link to={`/learn/interview?courseId=${courseId}`} className={link}>
              {questionCount} interview practice {questionCount === 1 ? 'question' : 'questions'} on
              this course’s skills
            </Link>
          </li>
        ) : null}
        {challenges.map((c) => (
          <li key={c.id}>
            <Link to={`/learn/projects/${c.id}`} className={link}>
              Project challenge: {c.title}
            </Link>{' '}
            <span className="text-muted">· about {c.estimatedHours} hours</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
