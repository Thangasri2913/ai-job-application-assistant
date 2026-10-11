import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateJobRequest,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  JOB_DESCRIPTION_MIN_LENGTH,
} from '@job-assist/shared';
import type { ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ApiError } from '../../../lib/api/api-error';
import { controlClasses } from '../../../shared/ui/field-styles';
import { FormField } from '../../../shared/ui/FormField';
import { Select } from '../../../shared/ui/Select';
import { TextArea } from '../../../shared/ui/TextArea';
import {
  emptyJobForm,
  jobFormSchema,
  type JobFormValues,
  toJobRequest,
} from '../validation/job-schema';

const FIELDS = Object.keys(emptyJobForm) as (keyof JobFormValues)[];

/**
 * Job title, company and the pasted description (required), plus optional details.
 * `onSubmit` may throw an ApiError; its field errors are shown on the matching inputs.
 */
export function JobForm({
  initial = emptyJobForm,
  onSubmit,
  actions,
}: {
  initial?: JobFormValues;
  onSubmit: (request: CreateJobRequest) => Promise<void>;
  actions: (state: { submitting: boolean }) => ReactNode;
}) {
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<JobFormValues>({ resolver: zodResolver(jobFormSchema), defaultValues: initial });
  const descriptionLength = useWatch({ control, name: 'description' }).trim().length;

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(toJobRequest(values));
    } catch (error) {
      if (error instanceof ApiError) {
        for (const { field, messages } of error.fieldErrors) {
          const name = FIELDS.find((f) => f === field);
          if (name) setError(name, { message: messages[0] });
        }
      }
    }
  });

  const text = (
    name: keyof JobFormValues,
    label: string,
    opts: { optional?: boolean; placeholder?: string; type?: string } = {},
  ) => (
    <FormField label={label} optional={opts.optional} error={errors[name]?.message}>
      {(a11y) => (
        <input
          {...a11y}
          type={opts.type ?? 'text'}
          placeholder={opts.placeholder}
          className={controlClasses(Boolean(errors[name]), 'h-10')}
          {...register(name)}
        />
      )}
    </FormField>
  );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {text('title', 'Job title', { placeholder: 'e.g. Frontend Developer' })}
        {text('companyName', 'Company', { placeholder: 'e.g. Example Corp' })}
      </div>
      <FormField
        label="Job description"
        error={errors.description?.message}
        hint={`Paste the complete posting, including requirements and responsibilities. ${descriptionLength} characters${descriptionLength < JOB_DESCRIPTION_MIN_LENGTH ? ` (at least ${JOB_DESCRIPTION_MIN_LENGTH})` : ''}.`}
      >
        {(a11y) => (
          <TextArea
            {...a11y}
            rows={14}
            hasError={Boolean(errors.description)}
            placeholder={
              'Frontend Developer\n\nWe are looking for…\n\nRequirements:\n- 3+ years of experience with…'
            }
            {...register('description')}
          />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('jobUrl', 'Job URL', { optional: true, type: 'url', placeholder: 'https://' })}
        {text('location', 'Location', { optional: true, placeholder: 'e.g. Chennai, Remote' })}
        <FormField label="Employment type" optional error={errors.employmentType?.message}>
          {(a11y) => (
            <Select {...a11y} {...register('employmentType')}>
              <option value="">Not specified</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        {text('source', 'Source', {
          optional: true,
          placeholder: 'e.g. LinkedIn, company website',
        })}
      </div>
      {actions({ submitting: isSubmitting })}
    </form>
  );
}
