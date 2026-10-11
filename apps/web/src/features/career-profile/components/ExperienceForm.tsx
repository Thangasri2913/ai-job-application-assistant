import { zodResolver } from '@hookform/resolvers/zod';
import type { ExperienceItem } from '@job-assist/shared';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Checkbox } from '../../../shared/ui/Checkbox';
import { controlClasses } from '../../../shared/ui/field-styles';
import { FormField } from '../../../shared/ui/FormField';
import { ListInput } from '../../../shared/ui/ListInput';
import { TagInput } from '../../../shared/ui/TagInput';
import { TextArea } from '../../../shared/ui/TextArea';
import { useSaveSectionItem } from '../hooks/useProfile';
import {
  type ExperienceValues,
  experienceSchema,
  fromMonthInput,
  fromText,
  toMonthInput,
  toText,
} from '../validation/profile-schemas';
import { SectionFormActions } from './SectionFormActions';

export function ExperienceForm({
  item,
  onDone,
}: {
  item: ExperienceItem | null;
  onDone: () => void;
}) {
  const save = useSaveSectionItem('experiences');
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ExperienceValues>({
    resolver: zodResolver(experienceSchema),
    defaultValues: {
      company: item?.company ?? '',
      jobTitle: item?.jobTitle ?? '',
      location: toText(item?.location),
      startDate: toMonthInput(item?.startDate ?? null),
      endDate: toMonthInput(item?.endDate ?? null),
      isCurrent: item?.isCurrent ?? false,
      description: toText(item?.description),
      responsibilities: item?.responsibilities ?? [],
      achievements: item?.achievements ?? [],
      technologies: item?.technologies ?? [],
    },
  });
  const isCurrent = useWatch({ control, name: 'isCurrent' });

  const onSubmit = handleSubmit(async (v) => {
    await save.mutateAsync({
      id: item?.id,
      input: {
        company: v.company.trim(),
        jobTitle: v.jobTitle.trim(),
        location: fromText(v.location),
        startDate: fromMonthInput(v.startDate),
        endDate: v.isCurrent ? null : fromMonthInput(v.endDate),
        isCurrent: v.isCurrent,
        description: fromText(v.description),
        responsibilities: v.responsibilities,
        achievements: v.achievements,
        technologies: v.technologies,
      },
    });
    onDone();
  });

  return (
    <form
      onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
      noValidate
      className="grid gap-4 sm:grid-cols-2"
    >
      <FormField label="Job title" error={errors.jobTitle?.message}>
        {(a) => (
          <input
            {...a}
            className={controlClasses(Boolean(errors.jobTitle), 'h-10')}
            {...register('jobTitle')}
          />
        )}
      </FormField>
      <FormField label="Company" error={errors.company?.message}>
        {(a) => (
          <input
            {...a}
            className={controlClasses(Boolean(errors.company), 'h-10')}
            {...register('company')}
          />
        )}
      </FormField>
      <FormField label="Location" optional>
        {(a) => (
          <input {...a} className={controlClasses(false, 'h-10')} {...register('location')} />
        )}
      </FormField>
      <div className="flex items-end pb-2">
        <Checkbox label="I currently work here" {...register('isCurrent')} />
      </div>
      <FormField label="Start" optional error={errors.startDate?.message}>
        {(a) => (
          <input
            {...a}
            type="month"
            className={controlClasses(false, 'h-10')}
            {...register('startDate')}
          />
        )}
      </FormField>
      <FormField label="End" optional error={errors.endDate?.message}>
        {(a) => (
          <input
            {...a}
            type="month"
            disabled={isCurrent}
            className={controlClasses(Boolean(errors.endDate), 'h-10')}
            {...register('endDate')}
          />
        )}
      </FormField>
      <FormField label="Description" optional className="sm:col-span-2">
        {(a) => <TextArea {...a} rows={3} {...register('description')} />}
      </FormField>
      <FormField label="Responsibilities" optional className="sm:col-span-2">
        {({ id }) => (
          <Controller
            control={control}
            name="responsibilities"
            render={({ field }) => (
              <ListInput
                id={id}
                value={field.value}
                onChange={field.onChange}
                placeholder="What you were responsible for"
              />
            )}
          />
        )}
      </FormField>
      <FormField
        label="Achievements"
        optional
        hint="Only include results you can stand behind."
        className="sm:col-span-2"
      >
        {({ id }) => (
          <Controller
            control={control}
            name="achievements"
            render={({ field }) => (
              <ListInput
                id={id}
                value={field.value}
                onChange={field.onChange}
                placeholder="A measurable result, if you have one"
              />
            )}
          />
        )}
      </FormField>
      <FormField label="Technologies" optional className="sm:col-span-2">
        {({ id }) => (
          <Controller
            control={control}
            name="technologies"
            render={({ field }) => (
              <TagInput id={id} value={field.value} onChange={field.onChange} maxTags={60} />
            )}
          />
        )}
      </FormField>
      <div className="sm:col-span-2">
        <SectionFormActions onCancel={onDone} saving={save.isPending} error={save.error} />
      </div>
    </form>
  );
}
