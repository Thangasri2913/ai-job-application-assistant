import { useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { Dialog } from '../../../shared/ui/Dialog';
import { controlClasses } from '../../../shared/ui/field-styles';
import { FormField } from '../../../shared/ui/FormField';
import { TagInput } from '../../../shared/ui/TagInput';
import { useResumeAction } from '../hooks/useResumes';
import { resumesApi } from '../services/resumes-api';

/**
 * Creates a structured resume from the career profile. Uses only profile facts.
 * No document file is generated yet (document generation is a later phase).
 */
export function CreateFromProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const create = useResumeAction(() =>
    resumesApi.createFromProfile({
      name: name.trim(),
      category: category.trim() || undefined,
      tags,
    }),
  );

  const close = () => {
    setName('');
    setCategory('');
    setTags([]);
    create.reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Create resume from profile"
      description="Built only from what’s in your career profile — nothing is added or invented."
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          create.mutate(undefined, {
            onSuccess: (resume) => {
              close();
              void navigate(`/resumes/${resume.id}`);
            },
          });
        }}
      >
        <FormField label="Resume name">
          {(a) => (
            <input
              {...a}
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. General Software Developer"
              className={controlClasses(false, 'h-10')}
            />
          )}
        </FormField>
        <FormField label="Category" optional>
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
        <FormField label="Tags" optional>
          {({ id }) => <TagInput id={id} value={tags} onChange={setTags} />}
        </FormField>
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted">
          This saves your profile content as a resume version you can compare against jobs later.
          Generating a downloadable PDF isn’t available yet.
        </p>
        {create.isError ? <Alert>{errorMessage(create.error)}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            Create resume
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
