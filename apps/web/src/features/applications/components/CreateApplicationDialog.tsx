import { zodResolver } from '@hookform/resolvers/zod';
import {
  APPLICATION_SOURCE_MAX_LENGTH,
  APPLICATION_SOURCE_SUGGESTIONS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_NOTE_MAX_LENGTH,
  INITIAL_APPLICATION_STATUSES,
  type JobDetail,
} from '@job-assist/shared';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { ApiError, errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { Dialog } from '../../../shared/ui/Dialog';
import { controlClasses } from '../../../shared/ui/field-styles';
import { FormField } from '../../../shared/ui/FormField';
import { Select } from '../../../shared/ui/Select';
import { TextArea } from '../../../shared/ui/TextArea';
import { useInvalidateApplications } from '../hooks/useApplications';
import { applicationsApi } from '../services/applications-api';
import { type ResumeVersionOption, ResumeVersionSelector } from './ResumeVersionSelector';

const today = () => new Date().toISOString().slice(0, 10);

const schema = z
  .object({
    resumeVersionId: z.string().min(1, 'Choose the resume you used.'),
    status: z.enum(INITIAL_APPLICATION_STATUSES),
    appliedAt: z.string(),
    source: z.string().trim().max(APPLICATION_SOURCE_MAX_LENGTH),
    applicationUrl: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || /^https?:\/\/\S+\.\S+/.test(v),
        'Enter a full URL starting with https://',
      ),
    note: z.string().trim().max(APPLICATION_NOTE_MAX_LENGTH),
  })
  .refine((v) => v.status !== 'APPLIED' || (v.appliedAt !== '' && v.appliedAt <= today()), {
    path: ['appliedAt'],
    message: 'Enter the date you applied (not in the future).',
  });

type Values = z.infer<typeof schema>;

/**
 * Starts tracking an application for a job. Nothing is submitted anywhere: the user applies
 * themselves and records it here, with the exact resume version used.
 */
export function CreateApplicationDialog({
  open,
  onClose,
  job,
  options,
  initialVersionId,
}: {
  open: boolean;
  onClose: () => void;
  job: JobDetail;
  options: ResumeVersionOption[];
  initialVersionId: string;
}) {
  const navigate = useNavigate();
  const invalidate = useInvalidateApplications();
  const [error, setError] = useState<{ message: string; existingId?: string } | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      resumeVersionId: initialVersionId,
      status: 'SAVED',
      appliedAt: today(),
      source: '',
      applicationUrl: job.jobUrl ?? '',
      note: '',
    },
  });
  const status = useWatch({ control, name: 'status' });
  const chosen = useWatch({ control, name: 'resumeVersionId' });
  const recommended = options.find((o) => o.recommended);

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      const created = await applicationsApi.create({
        jobId: job.id,
        resumeVersionId: v.resumeVersionId,
        status: v.status,
        appliedAt: v.status === 'APPLIED' ? v.appliedAt : null,
        source: v.source || null,
        applicationUrl: v.applicationUrl || null,
        note: v.note || null,
      });
      await invalidate();
      void navigate(`/applications/${created.id}`);
    } catch (e) {
      setError({
        message: errorMessage(e),
        existingId: e instanceof ApiError ? e.meta.existingApplicationId : undefined,
      });
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Track application"
      description={`${job.title} · ${job.companyName}. You apply on the employer’s site; this records it.`}
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        {error ? (
          <Alert>
            {error.message}{' '}
            {error.existingId ? (
              <Link to={`/applications/${error.existingId}`} className="font-medium underline">
                View application
              </Link>
            ) : null}
          </Alert>
        ) : null}
        <Controller
          control={control}
          name="resumeVersionId"
          render={({ field }) => (
            <ResumeVersionSelector
              options={options}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        {errors.resumeVersionId ? (
          <p className="text-sm text-danger">{errors.resumeVersionId.message}</p>
        ) : null}
        {recommended && chosen && chosen !== recommended.resumeVersionId ? (
          <p className="text-sm text-muted">
            You chose a different resume than the AI recommendation ({recommended.resumeName} v
            {recommended.versionNumber}). That’s fine: the choice is yours.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Status">
            {(a11y) => (
              <Select {...a11y} {...register('status')}>
                {INITIAL_APPLICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === 'APPLIED' ? 'Applied (already sent)' : APPLICATION_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          {status === 'APPLIED' ? (
            <FormField label="Date applied" error={errors.appliedAt?.message}>
              {(a11y) => (
                <input
                  {...a11y}
                  type="date"
                  max={today()}
                  className={controlClasses(Boolean(errors.appliedAt), 'h-10')}
                  {...register('appliedAt')}
                />
              )}
            </FormField>
          ) : (
            <div className="hidden sm:block" />
          )}
          <FormField label="Application source" optional error={errors.source?.message}>
            {(a11y) => (
              <>
                <input
                  {...a11y}
                  list="application-sources"
                  placeholder="e.g. LinkedIn"
                  className={controlClasses(Boolean(errors.source), 'h-10')}
                  {...register('source')}
                />
                <datalist id="application-sources">
                  {APPLICATION_SOURCE_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </>
            )}
          </FormField>
          <FormField label="Application URL" optional error={errors.applicationUrl?.message}>
            {(a11y) => (
              <input
                {...a11y}
                type="url"
                placeholder="https://"
                className={controlClasses(Boolean(errors.applicationUrl), 'h-10')}
                {...register('applicationUrl')}
              />
            )}
          </FormField>
        </div>
        <FormField label="Notes" optional error={errors.note?.message}>
          {(a11y) => <TextArea {...a11y} rows={3} {...register('note')} />}
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting} disabled={options.length === 0}>
            Create application
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
