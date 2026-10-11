import { Mic } from 'lucide-react';
import { Card } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { InterviewHistoryList } from '../components/InterviewHistoryList';
import { useInterviewHistory } from '../hooks/useInterviews';

export function InterviewHistoryPage() {
  const history = useInterviewHistory();
  return (
    <>
      <PageHeader
        title="Interview history"
        subtitle="Practice sessions and mock interviews for your applications."
      />
      {history.isPending ? (
        <LoadingState label="Loading interview history" />
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : history.data.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={Mic}
            title="No interview sessions yet"
            description="Open an application and choose “Interview preparation” to practise for that job."
          />
        </div>
      ) : (
        <Card>
          <InterviewHistoryList sessions={history.data} />
        </Card>
      )}
    </>
  );
}
