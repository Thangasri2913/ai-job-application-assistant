import { Link, useParams } from 'react-router';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { InterviewReportView } from '../components/InterviewReportView';
import { useInterviewReport } from '../hooks/useInterviews';

export function InterviewReportPage() {
  const { sessionId = '' } = useParams();
  const report = useInterviewReport(sessionId, true);
  return (
    <>
      <PageHeader
        title="Interview report"
        actions={
          <Link to={`/interviews/${sessionId}`} className={buttonClasses('secondary', 'md')}>
            Questions and answers
          </Link>
        }
      />
      {report.isPending ? (
        <LoadingState />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <InterviewReportView report={report.data} />
      )}
    </>
  );
}
