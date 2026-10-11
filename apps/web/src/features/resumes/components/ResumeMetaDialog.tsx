import { RESUME_NAME_MAX_LENGTH, type ResumeSummary } from '@job-assist/shared';
import { useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { Dialog } from '../../../shared/ui/Dialog';
import { controlClasses } from '../../../shared/ui/field-styles';
import { FormField } from '../../../shared/ui/FormField';
import { TagInput } from '../../../shared/ui/TagInput';
import { TextArea } from '../../../shared/ui/TextArea';
import { useResumeAction } from '../hooks/useResumes';
import { resumesApi } from '../services/resumes-api';

/** Rename, describe and tag a resume. Metadata only — content changes go through versions. */
export function ResumeMetaDialog({
  resume,
  open,
  onClose,
}: {
  resume: ResumeSummary;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Edit resume details">
      {open ? <MetaForm resume={resume} onClose={onClose} /> : null}
    </Dialog>
  );
}

function MetaForm({ resume, onClose }: { resume: ResumeSummary; onClose: () => void }) {
  const [name, setName] = useState(resume.name);
  const [description, setDescription] = useState(resume.description ?? '');
  const [category, setCategory] = useState(resume.category ?? '');
  const [tags, setTags] = useState(resume.tags);
  const save = useResumeAction(() =>
    resumesApi.update(resume.id, {
      name: name.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      tags,
    }),
  );
  const nameError = name.trim() === '' ? 'Enter a name.' : null;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (nameError) return;
        save.mutate(undefined, { onSuccess: onClose });
      }}
    >
      <FormField label="Name" error={nameError ?? undefined}>
        {(a) => (
          <input
            {...a}
            value={name}
            maxLength={RESUME_NAME_MAX_LENGTH}
            onChange={(e) => setName(e.target.value)}
            className={controlClasses(Boolean(nameError), 'h-10')}
          />
        )}
      </FormField>
      <FormField label="Category" optional hint="e.g. Frontend, Full Stack, General.">
        {(a) => (
          <input
            {...a}
            value={category}
            maxLength={60}
            onChange={(e) => setCategory(e.target.value)}
            className={controlClasses(false, 'h-10')}
          />
        )}
      </FormField>
      <FormField label="Description" optional>
        {(a) => (
          <TextArea
            {...a}
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </FormField>
      <FormField label="Tags" optional>
        {({ id }) => <TagInput id={id} value={tags} onChange={setTags} />}
      </FormField>
      {save.isError ? <Alert>{errorMessage(save.error)}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
