import type { SmartApplyQuestion } from '@job-assist/shared';
import { Inbox } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { QuestionAnswerForm } from '../components/QuestionAnswerForm';
import { useQuestionInbox } from '../hooks/useSmartApply';

/** Every required answer the user still has to give, grouped by application. */
export function QuestionInboxPage() {
  const inbox = useQuestionInbox();
  const groups = new Map<string, SmartApplyQuestion[]>();
  for (const q of inbox.data ?? []) {
    groups.set(q.smartApplicationId, [...(groups.get(q.smartApplicationId) ?? []), q]);
  }
  return (
    <>
      <PageHeader
        title="Questions to answer"
        subtitle="Information only you can provide. Nothing is guessed: applications wait until you answer."
        actions={
          <Link to="/smart-apply" className={buttonClasses('ghost', 'md')}>
            Smart Apply
          </Link>
        }
      />
      {inbox.isPending ? (
        <LoadingState label="Loading questions" />
      ) : inbox.isError ? (
        <ErrorState error={inbox.error} onRetry={() => void inbox.refetch()} />
      ) : groups.size === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No questions waiting"
          description="All required answers are given."
        />
      ) : (
        <div className="grid gap-6">
          {[...groups.entries()].map(([id, questions]) => (
            <section
              key={id}
              aria-label={`${questions[0]!.job.title} at ${questions[0]!.job.companyName}`}
            >
              <h2 className="mb-2 font-semibold">
                <Link to={`/smart-apply/${id}`} className="hover:text-primary hover:underline">
                  {questions[0]!.job.title}
                </Link>{' '}
                <span className="font-normal text-muted">· {questions[0]!.job.companyName}</span>
              </h2>
              <div className="grid gap-3">
                {questions.map((q) => (
                  <QuestionAnswerForm key={q.id} question={q} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
