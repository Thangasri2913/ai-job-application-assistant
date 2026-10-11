import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ProfileDetails,
  type UpdateProfileRequest,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  WORK_MODE_LABELS,
  WORK_MODES,
} from '@job-assist/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ApiError, errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { Checkbox } from '../../../shared/ui/Checkbox';
import { controlClasses } from '../../../shared/ui/field-styles';
import { FormField } from '../../../shared/ui/FormField';
import { TagInput } from '../../../shared/ui/TagInput';
import { TextArea } from '../../../shared/ui/TextArea';
import { useUpdateProfile } from '../hooks/useProfile';
import {
  fromText,
  type ProfileDetailsValues,
  profileDetailsFormSchema,
  profileDetailsSchema,
  toText,
} from '../validation/profile-schemas';

function toFormValues(d: ProfileDetails): ProfileDetailsValues {
  return {
    fullName: d.fullName,
    phone: toText(d.phone),
    location: toText(d.location),
    country: toText(d.country),
    linkedinUrl: toText(d.linkedinUrl),
    githubUrl: toText(d.githubUrl),
    portfolioUrl: toText(d.portfolioUrl),
    preferredRoles: d.preferredRoles,
    preferredLocations: d.preferredLocations,
    workModes: d.workModes,
    salaryMin: d.salaryMin === null ? '' : String(d.salaryMin),
    salaryMax: d.salaryMax === null ? '' : String(d.salaryMax),
    salaryCurrency: toText(d.salaryCurrency),
    employmentTypes: d.employmentTypes,
    noticePeriod: toText(d.noticePeriod),
    workAuthorization: toText(d.workAuthorization),
    headline: toText(d.headline),
    summary: toText(d.summary),
    yearsOfExperience: d.yearsOfExperience === null ? '' : String(d.yearsOfExperience),
    currentJobTitle: toText(d.currentJobTitle),
    currentCompany: toText(d.currentCompany),
    previousJobTitles: d.previousJobTitles,
    previousCompanies: d.previousCompanies,
  };
}

function toRequest(v: ProfileDetailsValues): UpdateProfileRequest {
  return {
    fullName: v.fullName.trim(),
    phone: fromText(v.phone),
    location: fromText(v.location),
    country: fromText(v.country),
    linkedinUrl: fromText(v.linkedinUrl),
    githubUrl: fromText(v.githubUrl),
    portfolioUrl: fromText(v.portfolioUrl),
    preferredRoles: v.preferredRoles,
    preferredLocations: v.preferredLocations,
    workModes: v.workModes,
    salaryMin: v.salaryMin === '' ? null : Number(v.salaryMin),
    salaryMax: v.salaryMax === '' ? null : Number(v.salaryMax),
    salaryCurrency: fromText(v.salaryCurrency)?.toUpperCase() ?? null,
    employmentTypes: v.employmentTypes,
    noticePeriod: fromText(v.noticePeriod),
    workAuthorization: fromText(v.workAuthorization),
    headline: fromText(v.headline),
    summary: fromText(v.summary),
    yearsOfExperience: v.yearsOfExperience === '' ? null : Number(v.yearsOfExperience),
    currentJobTitle: fromText(v.currentJobTitle),
    currentCompany: fromText(v.currentCompany),
    previousJobTitles: v.previousJobTitles,
    previousCompanies: v.previousCompanies,
  };
}

const FIELD_NAMES = Object.keys(profileDetailsSchema.shape) as (keyof ProfileDetailsValues)[];

export function ProfileDetailsForm({ details }: { details: ProfileDetails }) {
  const update = useUpdateProfile();
  const [saved, setSaved] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProfileDetailsValues>({
    resolver: zodResolver(profileDetailsFormSchema),
    values: toFormValues(details),
  });

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);
    try {
      const updated = await update.mutateAsync(toRequest(values));
      reset(toFormValues(updated));
      setSaved(true);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const { field, messages } of error.fieldErrors) {
          const name = FIELD_NAMES.find((f) => f === field);
          if (name) setError(name, { message: messages[0] });
        }
      }
    }
  });

  const text = (
    name: keyof ProfileDetailsValues,
    label: string,
    props: {
      optional?: boolean;
      placeholder?: string;
      type?: string;
      hint?: string;
      className?: string;
    } = {},
  ) => (
    <FormField
      label={label}
      error={errors[name]?.message}
      optional={props.optional ?? true}
      hint={props.hint}
      className={props.className}
    >
      {(a11y) => (
        <input
          {...a11y}
          type={props.type ?? 'text'}
          placeholder={props.placeholder}
          className={controlClasses(Boolean(errors[name]), 'h-10')}
          {...register(name)}
        />
      )}
    </FormField>
  );

  const tags = (
    name: 'preferredRoles' | 'preferredLocations' | 'previousJobTitles' | 'previousCompanies',
    label: string,
  ) => (
    <FormField label={label} optional>
      {({ id }) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <TagInput
              id={id}
              value={field.value}
              onChange={field.onChange}
              placeholder="Type and press Enter"
            />
          )}
        />
      )}
    </FormField>
  );

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-6">
      <Card aria-labelledby="personal-heading">
        <CardHeader id="personal-heading" title="Personal information" />
        <div className="grid gap-4 sm:grid-cols-2">
          {text('fullName', 'Full name', { optional: false })}
          <FormField label="Email" hint="Your sign-in email. It can’t be changed here.">
            {(a11y) => (
              <input
                {...a11y}
                value={details.email}
                readOnly
                className={controlClasses(false, 'h-10 bg-surface-muted')}
              />
            )}
          </FormField>
          {text('phone', 'Phone', { type: 'tel' })}
          {text('location', 'Location', { placeholder: 'City' })}
          {text('country', 'Country')}
          {text('linkedinUrl', 'LinkedIn', {
            type: 'url',
            placeholder: 'https://linkedin.com/in/…',
          })}
          {text('githubUrl', 'GitHub', { type: 'url', placeholder: 'https://github.com/…' })}
          {text('portfolioUrl', 'Portfolio', { type: 'url', placeholder: 'https://…' })}
        </div>
      </Card>

      <Card aria-labelledby="professional-heading">
        <CardHeader id="professional-heading" title="Professional details" />
        <div className="grid gap-4 sm:grid-cols-2">
          {text('headline', 'Professional headline', {
            placeholder: 'e.g. Frontend Developer · Angular & TypeScript',
            className: 'sm:col-span-2',
          })}
          <FormField
            label="Professional summary"
            optional
            error={errors.summary?.message}
            className="sm:col-span-2"
          >
            {(a11y) => (
              <TextArea
                {...a11y}
                rows={4}
                hasError={Boolean(errors.summary)}
                {...register('summary')}
              />
            )}
          </FormField>
          {text('yearsOfExperience', 'Years of experience', {
            placeholder: 'e.g. 3.3',
            hint: 'Saved exactly as you enter it.',
          })}
          {text('currentJobTitle', 'Current job title')}
          {text('currentCompany', 'Current company')}
          <div className="hidden sm:block" />
          {tags('previousJobTitles', 'Previous job titles')}
          {tags('previousCompanies', 'Previous companies')}
        </div>
      </Card>

      <Card aria-labelledby="preferences-heading">
        <CardHeader id="preferences-heading" title="Job preferences" />
        <div className="grid gap-4 sm:grid-cols-2">
          {tags('preferredRoles', 'Preferred roles')}
          {tags('preferredLocations', 'Preferred locations')}
          <fieldset className="flex flex-col gap-2 sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium">Work mode</legend>
            <Controller
              control={control}
              name="workModes"
              render={({ field }) => (
                <div className="flex flex-wrap gap-5">
                  {WORK_MODES.map((mode) => (
                    <Checkbox
                      key={mode}
                      label={WORK_MODE_LABELS[mode]}
                      checked={field.value.includes(mode)}
                      onChange={(event) =>
                        field.onChange(
                          event.target.checked
                            ? [...field.value, mode]
                            : field.value.filter((m) => m !== mode),
                        )
                      }
                    />
                  ))}
                </div>
              )}
            />
          </fieldset>
          <fieldset className="flex flex-col gap-2 sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium">Employment type</legend>
            <Controller
              control={control}
              name="employmentTypes"
              render={({ field }) => (
                <div className="flex flex-wrap gap-5">
                  {EMPLOYMENT_TYPES.map((type) => (
                    <Checkbox
                      key={type}
                      label={EMPLOYMENT_TYPE_LABELS[type]}
                      checked={field.value.includes(type)}
                      onChange={(event) =>
                        field.onChange(
                          event.target.checked
                            ? [...field.value, type]
                            : field.value.filter((t) => t !== type),
                        )
                      }
                    />
                  ))}
                </div>
              )}
            />
          </fieldset>
          {text('salaryMin', 'Minimum salary (yearly)', { placeholder: 'e.g. 1200000' })}
          {text('salaryMax', 'Maximum salary (yearly)', { placeholder: 'e.g. 1800000' })}
          {text('salaryCurrency', 'Currency', { placeholder: 'INR' })}
          <div className="hidden sm:block" />
          {text('noticePeriod', 'Notice period', { placeholder: 'e.g. 30 days' })}
          {text('workAuthorization', 'Work authorization')}
        </div>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        {update.isError ? <Alert>{errorMessage(update.error)}</Alert> : null}
        {saved && !isDirty ? (
          <span className="text-sm text-success" role="status">
            Profile saved.
          </span>
        ) : null}
        <Button
          variant="secondary"
          disabled={!isDirty || update.isPending}
          onClick={() => {
            reset(toFormValues(details));
            setSaved(false);
          }}
        >
          Cancel
        </Button>
        <Button type="submit" loading={update.isPending} disabled={!isDirty}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
