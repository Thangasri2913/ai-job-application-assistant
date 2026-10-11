import { zodResolver } from '@hookform/resolvers/zod';
import type { LanguageItem } from '@job-assist/shared';
import { useForm } from 'react-hook-form';
import { controlClasses } from '../../../shared/ui/field-styles';
import { FormField } from '../../../shared/ui/FormField';
import { useSaveSectionItem } from '../hooks/useProfile';
import {
  fromText,
  type LanguageValues,
  languageSchema,
  toText,
} from '../validation/profile-schemas';
import { SectionFormActions } from './SectionFormActions';

export function LanguageForm({ item, onDone }: { item: LanguageItem | null; onDone: () => void }) {
  const save = useSaveSectionItem('languages');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LanguageValues>({
    resolver: zodResolver(languageSchema),
    defaultValues: { name: item?.name ?? '', proficiency: toText(item?.proficiency) },
  });

  const onSubmit = handleSubmit(async (v) => {
    await save.mutateAsync({
      id: item?.id,
      input: { name: v.name.trim(), proficiency: fromText(v.proficiency) },
    });
    onDone();
  });

  return (
    <form
      onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
      noValidate
      className="grid gap-4 sm:grid-cols-2"
    >
      <FormField label="Language" error={errors.name?.message}>
        {(a) => (
          <input
            {...a}
            className={controlClasses(Boolean(errors.name), 'h-10')}
            {...register('name')}
          />
        )}
      </FormField>
      <FormField
        label="Proficiency"
        optional
        hint="In your own words, e.g. Native, Fluent, Professional."
      >
        {(a) => (
          <input {...a} className={controlClasses(false, 'h-10')} {...register('proficiency')} />
        )}
      </FormField>
      <div className="sm:col-span-2">
        <SectionFormActions onCancel={onDone} saving={save.isPending} error={save.error} />
      </div>
    </form>
  );
}
