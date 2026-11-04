import {
  MENTOR_INTENT_LABELS,
  MENTOR_INTENTS,
  MENTOR_MESSAGE_MAX_LENGTH,
  type MentorFallbackReason,
  type MentorIntent,
  type MentorProposedAction,
  type MentorRecommendation,
  type MentorResponse,
} from '@job-assist/shared';
import { MessageCircleQuestion } from 'lucide-react';
import { type FormEvent, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card } from '../../../shared/ui/Card';
import { cn } from '../../../shared/ui/cn';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Select } from '../../../shared/ui/Select';
import { TextArea } from '../../../shared/ui/TextArea';
import { LearnNav } from '../components/LearnNav';
import {
  useAnalysedJobs,
  useEnrollment,
  useLearningPreferences,
  useMentorAsk,
  useUpdatePreferences,
} from '../hooks/useLearn';

const TYPE_LABELS: Record<MentorRecommendation['type'], string> = {
  COURSE: 'Course',
  LESSON: 'Lesson',
  DIAGNOSTIC: 'Diagnostic',
  REVISION_TOPIC: 'Revision',
  INTERVIEW_QUESTION: 'Interview question',
  PROJECT_CHALLENGE: 'Project',
  JOB: 'Your analysed job',
};

/** Why a rule-based answer was shown although AI is enabled (AI_DISABLED needs no note). */
const FALLBACK_NOTES: Partial<Record<MentorFallbackReason, string>> = {
  AI_TIMEOUT: 'The AI answer took too long, so this is the rule-based answer from the same data.',
  AI_UNAVAILABLE:
    'The AI service is unavailable right now, so this is the rule-based answer from the same data.',
  AI_INVALID:
    'The AI’s choice of suggestions did not pass JobAssist’s checks, so it was discarded and this is the rule-based answer.',
  AI_LIMIT_REACHED:
    'You have used your AI answers for now (or another one is still being prepared), so this is the rule-based answer from the same data.',
};

/** Defence in depth: the API only returns in-app links, and anything else is shown as text. */
const isInAppLink = (href: string) => /^\/(learn|jobs)\//.test(href);

/** Only shown for JOB_FIT, so analysed jobs are fetched only when needed. */
function JobPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const jobs = useAnalysedJobs();
  const list = jobs.data?.jobs ?? [];
  return (
    <label className="block max-w-md">
      <span className="mb-1.5 block text-sm font-medium">Job to compare (optional)</span>
      <Select value={value} disabled={jobs.isPending} onChange={(e) => onChange(e.target.value)}>
        <option value="">
          {list.length ? 'Most recently analysed job' : 'No analysed jobs yet'}
        </option>
        {list.map((j) => (
          <option key={j.id} value={j.id}>
            {j.title} — {j.companyName}
            {j.isSampleData ? ' (sample data)' : ''}
          </option>
        ))}
      </Select>
    </label>
  );
}

function AddCourseButton({
  action,
}: {
  action: Extract<MentorProposedAction, { type: 'ADD_COURSE' }>;
}) {
  const { enroll } = useEnrollment(action.courseId);
  return (
    <div>
      <Button
        size="sm"
        variant="secondary"
        loading={enroll.isPending}
        disabled={enroll.isSuccess}
        onClick={() => enroll.mutate()}
      >
        {enroll.isSuccess ? 'Added to My learning' : action.label}
      </Button>
      <p className="mt-1 text-xs text-muted">{action.description}</p>
      {enroll.isError ? <Alert>{errorMessage(enroll.error)}</Alert> : null}
    </div>
  );
}

function SetRoleButton({
  action,
}: {
  action: Extract<MentorProposedAction, { type: 'SET_TARGET_ROLE' }>;
}) {
  const prefs = useLearningPreferences();
  const update = useUpdatePreferences();
  const current = prefs.data;
  return (
    <div>
      <Button
        size="sm"
        variant="secondary"
        disabled={!current || update.isSuccess}
        loading={update.isPending}
        onClick={() =>
          current &&
          update.mutate({
            targetRole: action.role,
            interestCategories: current.interestCategories,
            interestSkillIds: current.interestSkillIds,
            weeklyGoalMinutes: current.weeklyGoalMinutes,
          })
        }
      >
        {update.isSuccess ? 'Target role saved' : action.label}
      </Button>
      <p className="mt-1 text-xs text-muted">{action.description}</p>
      {update.isError ? <Alert>{errorMessage(update.error)}</Alert> : null}
    </div>
  );
}

function Answer({
  response,
  onUseQuestion,
}: {
  response: MentorResponse;
  onUseQuestion: (question: string) => void;
}) {
  const fallbackNote = response.fallbackReason ? FALLBACK_NOTES[response.fallbackReason] : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {response.source === 'AI' ? (
          <Badge tone="primary">AI-ordered suggestions · facts from your records</Badge>
        ) : (
          <Badge tone="neutral">Rule-based answer (no AI)</Badge>
        )}
        <span className="text-xs text-muted">{MENTOR_INTENT_LABELS[response.intent]}</span>
      </div>
      {fallbackNote ? (
        <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {fallbackNote}
        </p>
      ) : null}
      <p className="text-base">{response.summary}</p>
      {response.explanation ? (
        // Fixed JobAssist wording about the AI's selection; the AI writes no text.
        <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
          <p className="mb-1 text-xs font-medium text-muted">About these suggestions</p>
          <p>{response.explanation}</p>
        </div>
      ) : null}

      {response.recommendations.length ? (
        <section aria-labelledby="mentor-recommendations">
          <h3 id="mentor-recommendations" className="mb-2 text-sm font-semibold">
            Suggestions
          </h3>
          <ol className="space-y-2">
            {response.recommendations.map((r) => (
              <li
                key={`${r.type}-${r.courseId ?? ''}-${r.id}`}
                className="rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{TYPE_LABELS[r.type]}</Badge>
                  {isInAppLink(r.href) ? (
                    <Link
                      to={r.href}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {r.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.title}</span>
                  )}
                </div>
                <p className="mt-1 text-sm">
                  <span className="font-medium">Why: </span>
                  {r.reason}
                </p>
                {r.evidence.length ? (
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                    {r.evidence.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {response.proposedActions.length ? (
        <section aria-labelledby="mentor-actions">
          <h3 id="mentor-actions" className="mb-2 text-sm font-semibold">
            Optional actions
          </h3>
          <p className="mb-2 text-xs text-muted">Nothing changes unless you click.</p>
          <div className="space-y-3">
            {response.proposedActions.map((a) =>
              a.type === 'ADD_COURSE' ? (
                <AddCourseButton key={`add-${a.courseId}`} action={a} />
              ) : (
                <SetRoleButton key={`role-${a.role}`} action={a} />
              ),
            )}
          </div>
        </section>
      ) : null}

      {response.uncertainty.length ? (
        <section aria-labelledby="mentor-uncertainty">
          <h3 id="mentor-uncertainty" className="mb-1 text-sm font-semibold">
            What this answer does not know
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {response.uncertainty.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {response.followUpQuestion ? (
        <div className="rounded-lg border border-border p-3 text-sm">
          <p>
            <span className="font-medium">You could ask next: </span>
            {response.followUpQuestion}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => onUseQuestion(response.followUpQuestion!)}
          >
            Use this question
          </Button>
        </div>
      ) : null}

      {response.factsUsed.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">What this answer is based on</summary>
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            {response.factsUsed.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-muted">{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
      <p className="text-xs text-muted">{response.disclaimer}</p>
    </div>
  );
}

export function MentorPage() {
  const ask = useMentorAsk();
  const [intent, setIntent] = useState<MentorIntent>('GENERAL_PROGRESS');
  const [message, setMessage] = useState('');
  const [jobId, setJobId] = useState('');
  const answerRef = useRef<HTMLDivElement>(null);
  // Set synchronously, so a fast double click cannot send two requests before isPending updates.
  const inFlight = useRef(false);
  const messageId = useId();
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current || ask.isPending) return; // no duplicate submissions
    inFlight.current = true;
    ask.mutate(
      {
        intent,
        ...(message.trim() ? { message: message.trim() } : {}),
        ...(intent === 'JOB_FIT' && jobId ? { jobId } : {}),
      },
      {
        onSuccess: () => requestAnimationFrame(() => answerRef.current?.focus()),
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Career mentor"
        subtitle="Ask for guidance based on your own learning progress, skills and analysed jobs."
      />
      <LearnNav />
      <p className="mb-6 rounded-lg bg-surface-muted px-3.5 py-3 text-sm text-muted">
        Answers come only from your JobAssist data. The summary, facts, reasons and all wording are
        always JobAssist’s own. When AI is turned on, it only chooses which suggestions to show and
        in what order; it writes nothing. Otherwise you get a rule-based answer. Nothing you type is
        saved. It never applies for jobs, edits your resume or changes anything unless you click an
        action.
      </p>

      <Card className="mb-6">
        <form onSubmit={onSubmit} aria-label="Ask the career mentor" className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">What would you like help with?</legend>
            <div className="flex flex-wrap gap-2">
              {MENTOR_INTENTS.map((i) => (
                <label
                  key={i}
                  className={cn(
                    'cursor-pointer rounded-full border px-3 py-1.5 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
                    intent === i
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-border hover:bg-surface-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="mentor-intent"
                    value={i}
                    checked={intent === i}
                    onChange={() => setIntent(i)}
                    className="sr-only"
                  />
                  {MENTOR_INTENT_LABELS[i]}
                </label>
              ))}
            </div>
          </fieldset>
          {intent === 'JOB_FIT' ? <JobPicker value={jobId} onChange={setJobId} /> : null}
          <div>
            <label htmlFor={messageId} className="text-sm font-medium">
              Your question (optional)
            </label>
            <TextArea
              ref={messageRef}
              id={messageId}
              rows={3}
              className="mt-1.5"
              value={message}
              maxLength={MENTOR_MESSAGE_MAX_LENGTH}
              aria-describedby={hintId}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p id={hintId} className="mt-1 text-xs text-muted">
              Mention a skill or role — for example “SQL” or “Data Analyst” — to focus the answer.{' '}
              {message.length}/{MENTOR_MESSAGE_MAX_LENGTH} characters.
            </p>
          </div>
          <Button type="submit" loading={ask.isPending}>
            Ask the mentor
          </Button>
        </form>
      </Card>

      <div ref={answerRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {ask.isError ? (
          <Alert>
            {errorMessage(ask.error)}{' '}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => ask.reset()}
            >
              Dismiss
            </button>
          </Alert>
        ) : ask.data ? (
          <Card aria-labelledby="mentor-answer">
            <h2 id="mentor-answer" className="mb-3 text-base font-semibold">
              Mentor’s answer
            </h2>
            <Answer
              response={ask.data}
              onUseQuestion={(q) => {
                // Fills the box only; the user decides whether to send it.
                setMessage(q.slice(0, MENTOR_MESSAGE_MAX_LENGTH));
                messageRef.current?.focus();
              }}
            />
          </Card>
        ) : !ask.isPending ? (
          <EmptyState
            icon={MessageCircleQuestion}
            title="Choose a topic and ask"
            description="Answers use your progress, diagnostics, preferences and analysed jobs. They work without a resume or target role."
          />
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/learn/my-learning" className={buttonClasses('secondary', 'sm')}>
          Back to My learning
        </Link>
        <Link to="/learn" className={buttonClasses('ghost', 'sm')}>
          Browse courses
        </Link>
      </div>
    </>
  );
}
