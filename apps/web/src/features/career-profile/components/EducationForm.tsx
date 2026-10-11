import { zodResolver } from '@hookform/resolvers/zod';
import type { EducationItem } from '@job-assist/shared';
import { useForm } from 'react-hook-form';
import { controlClasses } from '../../../shared/ui/field-styles';
import { FormField } from '../../../shared/ui/FormField';
import { useSaveSectionItem } from '../hooks/useProfile';
import {
  type EducationValues,
  educationSchema,
  fromMonthInput,
  fromText,
  toMonthInput,
  toText,
} from '../validation/profile-schemas';
import { SectionFormActions } from './SectionFormActions';

export function EducationForm({
  item,
  onDone,
}: {
  item: EducationItem | null;
  onDone: () => void;
}) {
  const save = useSaveSectionItem('education');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EducationValues>({
    resolver: zodResolver(educationSchema),
    defaultValues: {
      institution: item?.institution ?? '',
      degree: toText(item?.degree),
      fieldOfStudy: toText(item?.fieldOfStudy),
      startDate: toMonthInput(item?.startDate ?? null),
      endDate: toMonthInput(item?.endDate ?? null),
      grade: toText(item?.grade),
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    await save.mutateAsync({
      id: item?.id,
      input: {
        institution: v.institution.trim(),
        degree: fromText(v.degree),
        fieldOfStudy: fromText(v.fieldOfStudy),
        startDate: fromMonthInput(v.startDate),
        endDate: fromMonthInput(v.endDate),
        grade: fromText(v.grade),
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
      <FormField label="Institution" error={errors.institution?.message} className="sm:col-span-2">
        {(a) => (
          <input
            {...a}
            className={controlClasses(Boolean(errors.institution), 'h-10')}
            {...register('institution')}
          />
        )}
      </FormField>
      <FormField label="Degree" optional>
        {(a) => (
          <input
            {...a}
            placeholder="e.g. B.Tech"
            className={controlClasses(false, 'h-10')}
            {...register('degree')}
          />
        )}
      </FormField>
      <FormField label="Field of study" optional>
        {(a) => (
          <input {...a} className={controlClasses(false, 'h-10')} {...register('fieldOfStudy')} />
        )}
      </FormField>
      <FormField label="Start" optional>
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
            className={controlClasses(Boolean(errors.endDate), 'h-10')}
            {...register('endDate')}
          />
        )}
      </FormField>
      <FormField label="Grade / GPA" optional hint="Only if you want it shown.">
        {(a) => <input {...a} className={controlClasses(false, 'h-10')} {...register('grade')} />}
      </FormField>
      <div className="sm:col-span-2">
        <SectionFormActions onCancel={onDone} saving={save.isPending} error={save.error} />
      </div>
    </form>
  );
}
