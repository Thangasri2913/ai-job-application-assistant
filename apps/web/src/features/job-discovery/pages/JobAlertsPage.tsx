import type { CreateJobAlertRequest, JobAlertItem } from '@job-assist/shared';
import { BellRing, Plus } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { Dialog } from '../../../shared/ui/Dialog';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { JobAlertCard } from '../components/JobAlertCard';
import { JobAlertForm } from '../components/JobAlertForm';
import { SampleDataNotice } from '../components/SampleDataNotice';
import {
  useDiscoveryAction,
  useJobAlerts,
  useJobSources,
  useRunAlert,
} from '../hooks/useDiscovery';
import { discoveryApi } from '../services/discovery-api';

export function JobAlertsPage() {
  const alerts = useJobAlerts();
  const sources = useJobSources();
  const [editing, setEditing] = useState<JobAlertItem | 'new' | null>(null);
  const [deleting, setDeleting] = useState<JobAlertItem | null>(null);
  const create = useDiscoveryAction((body: CreateJobAlertRequest) =>
    discoveryApi.createAlert(body),
  );
  const update = useDiscoveryAction(
    ({ id, body }: { id: string; body: Partial<CreateJobAlertRequest> }) =>
      discoveryApi.updateAlert(id, body),
  );
  const remove = useDiscoveryAction((id: string) => discoveryApi.deleteAlert(id));
  const run = useRunAlert();
  const enabled = sources.data?.filter((s) => s.isEnabled) ?? [];
  const devMode = enabled.some((s) => s.isDevelopment);

  const save = (body: CreateJobAlertRequest) => {
    const done = { onSuccess: () => setEditing(null) };
    if (editing === 'new') create.mutate(body, done);
    else if (editing) update.mutate({ id: editing.id, body }, done);
  };

  return (
    <>
      <PageHeader
        title="Job alerts"
        subtitle="Saved searches that find jobs and compare them with all your resumes."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            New alert
          </Button>
        }
      />
      <div className="mb-5 grid gap-3">
        {devMode ? <SampleDataNotice /> : null}
        {sources.data && enabled.length === 0 ? (
          <Alert>No job sources are configured on the server, so alerts can’t find jobs yet.</Alert>
        ) : null}
        <p className="text-sm text-muted">
          Alerts only search legitimate job sources and never apply for you. Only your search terms
          are sent to a source — never your resume or profile.
        </p>
      </div>
      {run.error || update.error || remove.error ? (
        <div className="mb-4">
          <Alert>{errorMessage(run.error ?? update.error ?? remove.error)}</Alert>
        </div>
      ) : null}
      {alerts.isPending ? (
        <LoadingState label="Loading job alerts" />
      ) : alerts.isError ? (
        <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} />
      ) : alerts.data.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="No job alerts yet"
          description="Create an alert with keywords, locations and a minimum match score. It runs on your schedule, or whenever you choose Run now."
        >
          <Button onClick={() => setEditing('new')}>Create your first alert</Button>
        </EmptyState>
      ) : (
        <ul aria-label="Job alerts" className="grid gap-4">
          {alerts.data.map((a) => (
            <JobAlertCard
              key={a.id}
              alert={a}
              running={run.isPending && run.variables === a.id}
              onRun={() => run.mutate(a.id)}
              onEdit={() => setEditing(a)}
              onDelete={() => setDeleting(a)}
              onToggle={() => update.mutate({ id: a.id, body: { isActive: !a.isActive } })}
            />
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New job alert' : 'Edit job alert'}
        size="lg"
      >
        {editing !== null ? (
          <JobAlertForm
            alert={editing === 'new' ? undefined : editing}
            submitting={create.isPending || update.isPending}
            error={create.error || update.error ? errorMessage(create.error ?? update.error) : null}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete job alert?"
        confirmLabel="Delete alert"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
      >
        Its run history is deleted. Recommendations and jobs it found are kept.
      </ConfirmDialog>
    </>
  );
}
