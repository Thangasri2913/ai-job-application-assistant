import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError, errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card } from '../../../shared/ui/Card';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { JobForm } from '../components/JobForm';
import { useInvalidateJobs } from '../hooks/useJobs';
import { jobsApi } from '../services/jobs-api';

/** Paste a job → save it → start the analysis → open the job, which shows progress. */
export function AddJobPage() {
  const navigate = useNavigate();
  const invalidate = useInvalidateJobs();
  const [error, setError] = useState<{ message: string; existingJobId?: string } | null>(null);

  return (
    <>
      <PageHeader
        title="Add a job"
        subtitle="Paste the job posting. It’s compared with your career profile and every active resume; nothing is sent anywhere else."
      />
      <Card className="max-w-3xl">
        {error ? (
          <div className="mb-4">
            <Alert>
              {error.message}{' '}
              {error.existingJobId ? (
                <Link to={`/jobs/${error.existingJobId}`} className="font-medium underline">
                  Open the existing job
                </Link>
              ) : null}
            </Alert>
          </div>
        ) : null}
        <JobForm
          onSubmit={async (request) => {
            setError(null);
            try {
              const job = await jobsApi.create(request);
              // The job is saved even if starting the analysis fails; the detail page offers a retry.
              await jobsApi.analyze(job.id).catch(() => undefined);
              void invalidate();
              void navigate(`/jobs/${job.id}`);
            } catch (e) {
              setError({
                message: errorMessage(e),
                existingJobId: e instanceof ApiError ? e.meta.existingJobId : undefined,
              });
              throw e;
            }
          }}
          actions={({ submitting }) => (
            <div className="flex justify-end gap-2">
              <Link to="/jobs" className={buttonClasses('secondary', 'md')}>
                Cancel
              </Link>
              <Button type="submit" loading={submitting}>
                Save and analyse
              </Button>
            </div>
          )}
        />
      </Card>
    </>
  );
}
