import { zodResolver } from '@hookform/resolvers/zod';
import type { AchievementItem } from '@job-assist/shared';
import { useForm } from 'react-hook-form';
import { controlClasses } from '../../../shared/ui/field-styles';
import { FormField } from '../../../shared/ui/FormField';
import { TextArea } from '../../../shared/ui/TextArea';
import { useSaveSectionItem } from '../hooks/useProfile';
import {
  type AchievementValues,
  achievementSchema,
  fromMonthInput,
  fromText,
  toMonthInput,
  toText,
} from '../validation/profile-schemas';
import { SectionFormActions } from './SectionFormActions';

export function AchievementForm({
  item,
  onDone,
}: {
  item: AchievementItem | null;
  onDone: () => void;
}) {
  const save = useSaveSectionItem('achievements');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AchievementValues>({
    resolver: zodResolver(achievementSchema),
    defaultValues: {
      title: item?.title ?? '',
      description: toText(item?.description),
      date: toMonthInput(item?.date ?? null),
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    await save.mutateAsync({
      id: item?.id,
      input: {
        title: v.title.trim(),
        description: fromText(v.description),
        date: fromMonthInput(v.date),
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
      <FormField label="Achievement" error={errors.title?.message} className="sm:col-span-2">
        {(a) => (
          <input
            {...a}
            className={controlClasses(Boolean(errors.title), 'h-10')}
            {...register('title')}
          />
        )}
      </FormField>
      <FormField
        label="Details"
        optional
        hint="Only results you can stand behind."
        className="sm:col-span-2"
      >
        {(a) => <TextArea {...a} rows={3} {...register('description')} />}
      </FormField>
      <FormField label="Date" optional>
        {(a) => (
          <input
            {...a}
            type="month"
            className={controlClasses(false, 'h-10')}
            {...register('date')}
          />
        )}
      </FormField>
      <div className="sm:col-span-2">
        <SectionFormActions onCancel={onDone} saving={save.isPending} error={save.error} />
      </div>
    </form>
  );
}
