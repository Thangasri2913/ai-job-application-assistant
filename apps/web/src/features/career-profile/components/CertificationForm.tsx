import { zodResolver } from '@hookform/resolvers/zod';
import type { CertificationItem } from '@job-assist/shared';
import { useForm } from 'react-hook-form';
import { controlClasses } from '../../../shared/ui/field-styles';
import { FormField } from '../../../shared/ui/FormField';
import { useSaveSectionItem } from '../hooks/useProfile';
import {
  type CertificationValues,
  certificationSchema,
  fromMonthInput,
  fromText,
  toMonthInput,
  toText,
} from '../validation/profile-schemas';
import { SectionFormActions } from './SectionFormActions';

export function CertificationForm({
  item,
  onDone,
}: {
  item: CertificationItem | null;
  onDone: () => void;
}) {
  const save = useSaveSectionItem('certifications');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CertificationValues>({
    resolver: zodResolver(certificationSchema),
    defaultValues: {
      name: item?.name ?? '',
      issuer: toText(item?.issuer),
      issueDate: toMonthInput(item?.issueDate ?? null),
      expiryDate: toMonthInput(item?.expiryDate ?? null),
      credentialId: toText(item?.credentialId),
      credentialUrl: toText(item?.credentialUrl),
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    await save.mutateAsync({
      id: item?.id,
      input: {
        name: v.name.trim(),
        issuer: fromText(v.issuer),
        issueDate: fromMonthInput(v.issueDate),
        expiryDate: fromMonthInput(v.expiryDate),
        credentialId: fromText(v.credentialId),
        credentialUrl: fromText(v.credentialUrl),
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
      <FormField label="Certification name" error={errors.name?.message} className="sm:col-span-2">
        {(a) => (
          <input
            {...a}
            className={controlClasses(Boolean(errors.name), 'h-10')}
            {...register('name')}
          />
        )}
      </FormField>
      <FormField label="Issuer" optional>
        {(a) => <input {...a} className={controlClasses(false, 'h-10')} {...register('issuer')} />}
      </FormField>
      <FormField label="Credential ID" optional>
        {(a) => (
          <input {...a} className={controlClasses(false, 'h-10')} {...register('credentialId')} />
        )}
      </FormField>
      <FormField label="Issued" optional>
        {(a) => (
          <input
            {...a}
            type="month"
            className={controlClasses(false, 'h-10')}
            {...register('issueDate')}
          />
        )}
      </FormField>
      <FormField label="Expires" optional error={errors.expiryDate?.message}>
        {(a) => (
          <input
            {...a}
            type="month"
            className={controlClasses(Boolean(errors.expiryDate), 'h-10')}
            {...register('expiryDate')}
          />
        )}
      </FormField>
      <FormField
        label="Credential URL"
        optional
        error={errors.credentialUrl?.message}
        className="sm:col-span-2"
      >
        {(a) => (
          <input
            {...a}
            type="url"
            placeholder="https://"
            className={controlClasses(Boolean(errors.credentialUrl), 'h-10')}
            {...register('credentialUrl')}
          />
        )}
      </FormField>
      <div className="sm:col-span-2">
        <SectionFormActions onCancel={onDone} saving={save.isPending} error={save.error} />
      </div>
    </form>
  );
}
