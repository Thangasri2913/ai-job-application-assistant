import type { FeedbackDimension, InterviewFeedback } from '@job-assist/shared';
import { Link } from 'react-router';
import { Badge } from '../../../shared/ui/Badge';
import { ProgressBar } from '../../../shared/ui/ProgressBar';

const DIMENSIONS: { key: keyof InterviewFeedback['dimensions']; label: string; help: string }[] = [
  {
    key: 'correctness',
    label: 'Key concepts',
    help: 'Concepts the rubric looks for. Correct points phrased differently can be missed.',
  },
  { key: 'clarity', label: 'Clarity', help: 'Sentence length, structure and vague phrases.' },
  {
    key: 'completeness',
    label: 'Length',
    help: 'Compared with a typical answer to this question.',
  },
];

function Dimension({
  label,
  help,
  value,
}: {
  label: string;
  help: string;
  value: FeedbackDimension;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted">{value.score} / 10</span>
      </div>
      <ProgressBar value={value.score * 10} label={`${label}: ${value.score} out of 10`} />
      <p className="mt-1 text-sm">{value.summary}</p>
      <p className="text-xs text-muted">{help}</p>
    </div>
  );
}

/** Structured practice feedback for one attempt. Rule-based, labelled and fallible. */
export function InterviewFeedbackPanel({ feedback }: { feedback: InterviewFeedback }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>Attempt {feedback.attemptNumber}</Badge>
        <Badge tone="neutral">Rule-based practice feedback</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {DIMENSIONS.map((d) => (
          <Dimension key={d.key} label={d.label} help={d.help} value={feedback.dimensions[d.key]} />
        ))}
      </div>
      {feedback.conceptsCovered.length ? (
        <div>
          <h4 className="mb-1 text-sm font-semibold">Concepts you mentioned</h4>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {feedback.conceptsCovered.map((c) => (
              <li key={c.id}>{c.label}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {feedback.missingConcepts.length ? (
        <div>
          <h4 className="mb-1 text-sm font-semibold">Missing concepts and where to revise them</h4>
          <ul className="space-y-1 text-sm">
            {feedback.missingConcepts.map((c) => (
              <li key={c.id}>
                {c.label}
                {c.revise ? (
                  <>
                    {' — '}
                    <Link
                      to={`/learn/courses/${c.revise.courseId}/lessons/${c.revise.lessonId}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Revise “{c.revise.lessonTitle}”
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {feedback.improvements.length ? (
        <div>
          <h4 className="mb-1 text-sm font-semibold">To improve</h4>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {feedback.improvements.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {feedback.strengths.length ? (
        <div>
          <h4 className="mb-1 text-sm font-semibold">Strengths</h4>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {feedback.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <details className="rounded-lg border border-border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">
          Show an example answer (one of many valid answers)
        </summary>
        <p className="mt-2 text-sm whitespace-pre-line">{feedback.exampleAnswer}</p>
        <p className="mt-2 text-xs text-muted">
          This is an example, not the only correct answer. Use your own words and only describe
          experience you really have.
        </p>
      </details>
      <p className="text-xs text-muted">{feedback.disclaimer}</p>
    </div>
  );
}
