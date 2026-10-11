import { zodResolver } from '@hookform/resolvers/zod';
import type { ProjectItem } from '@job-assist/shared';
import { Controller, useForm } from 'react-hook-form';
import { controlClasses } from '../../../shared/ui/field-styles';
import { FormField } from '../../../shared/ui/FormField';
import { ListInput } from '../../../shared/ui/ListInput';
import { TagInput } from '../../../shared/ui/TagInput';
import { TextArea } from '../../../shared/ui/TextArea';
import { useSaveSectionItem } from '../hooks/useProfile';
import { fromText, type ProjectValues, projectSchema, toText } from '../validation/profile-schemas';
import { SectionFormActions } from './SectionFormActions';

export function ProjectForm({ item, onDone }: { item: ProjectItem | null; onDone: () => void }) {
  const save = useSaveSectionItem('projects');
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: item?.name ?? '',
      description: toText(item?.description),
      role: toText(item?.role),
      technologies: item?.technologies ?? [],
      responsibilities: item?.responsibilities ?? [],
      achievements: item?.achievements ?? [],
      url: toText(item?.url),
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    await save.mutateAsync({
      id: item?.id,
      input: {
        name: v.name.trim(),
        description: fromText(v.description),
        role: fromText(v.role),
        technologies: v.technologies,
        responsibilities: v.responsibilities,
        achievements: v.achievements,
        url: fromText(v.url),
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
      <FormField label="Project name" error={errors.name?.message}>
        {(a) => (
          <input
            {...a}
            className={controlClasses(Boolean(errors.name), 'h-10')}
            {...register('name')}
          />
        )}
      </FormField>
      <FormField label="Your role" optional>
        {(a) => <input {...a} className={controlClasses(false, 'h-10')} {...register('role')} />}
      </FormField>
      <FormField label="Description" optional className="sm:col-span-2">
        {(a) => <TextArea {...a} rows={3} {...register('description')} />}
      </FormField>
      <FormField label="Project URL" optional error={errors.url?.message} className="sm:col-span-2">
        {(a) => (
          <input
            {...a}
            type="url"
            placeholder="https://"
            className={controlClasses(Boolean(errors.url), 'h-10')}
            {...register('url')}
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
      <FormField label="Responsibilities" optional className="sm:col-span-2">
        {({ id }) => (
          <Controller
            control={control}
            name="responsibilities"
            render={({ field }) => (
              <ListInput id={id} value={field.value} onChange={field.onChange} />
            )}
          />
        )}
      </FormField>
      <FormField label="Achievements" optional className="sm:col-span-2">
        {({ id }) => (
          <Controller
            control={control}
            name="achievements"
            render={({ field }) => (
              <ListInput id={id} value={field.value} onChange={field.onChange} />
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
