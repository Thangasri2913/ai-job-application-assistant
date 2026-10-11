import { zodResolver } from '@hookform/resolvers/zod';
import {
  SKILL_CATEGORIES,
  SKILL_CATEGORY_LABELS,
  type SkillCategory,
  type SkillItem,
} from '@job-assist/shared';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Dialog } from '../../../shared/ui/Dialog';
import { controlClasses } from '../../../shared/ui/field-styles';
import { Select } from '../../../shared/ui/Select';
import { useDeleteSectionItem, useSaveSectionItem } from '../hooks/useProfile';
import { type SkillValues, skillSchema } from '../validation/profile-schemas';

export function SkillsSection({ skills }: { skills: SkillItem[] }) {
  const save = useSaveSectionItem('skills');
  const remove = useDeleteSectionItem('skills');
  const [editing, setEditing] = useState<SkillItem | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SkillValues>({
    resolver: zodResolver(skillSchema),
    defaultValues: { name: '', category: 'FRONTEND' },
  });

  const onAdd = handleSubmit(async (values) => {
    await save.mutateAsync({ input: { name: values.name.trim(), category: values.category } });
    reset({ name: '', category: values.category });
  });

  const grouped = SKILL_CATEGORIES.map((category) => ({
    category,
    items: skills.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <Card aria-labelledby="skills-heading">
      <h2 id="skills-heading" className="mb-4 text-base font-semibold">
        Skills
      </h2>

      <form
        onSubmit={(e) => void onAdd(e).catch(() => undefined)}
        noValidate
        className="mb-4 flex flex-wrap gap-2"
      >
        <label htmlFor="new-skill" className="sr-only">
          Skill name
        </label>
        <input
          id="new-skill"
          placeholder="Add a skill, e.g. Angular"
          className={controlClasses(Boolean(errors.name), 'h-10 min-w-48 flex-1')}
          {...register('name')}
        />
        <label htmlFor="new-skill-category" className="sr-only">
          Category
        </label>
        <Select id="new-skill-category" className="w-44" {...register('category')}>
          {SKILL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {SKILL_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" loading={save.isPending}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </form>
      {errors.name ? <p className="-mt-2 mb-3 text-sm text-danger">{errors.name.message}</p> : null}
      {save.isError ? (
        <div className="mb-3">
          <Alert>{errorMessage(save.error)}</Alert>
        </div>
      ) : null}
      {remove.isError ? (
        <div className="mb-3">
          <Alert>{errorMessage(remove.error)}</Alert>
        </div>
      ) : null}

      {grouped.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          No skills yet. Add the skills you actually use — they are the facts every suggestion is
          based on.
        </p>
      ) : (
        <div className="grid gap-4">
          {grouped.map(({ category, items }) => (
            <div key={category}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                {SKILL_CATEGORY_LABELS[category as SkillCategory]}
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {items.map((skill) => (
                  <li
                    key={skill.id}
                    className="inline-flex items-center rounded-lg border border-border bg-surface-muted text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => setEditing(skill)}
                      className="rounded-l-lg py-1 pr-1 pl-2.5 hover:text-primary"
                      aria-label={`Edit ${skill.name}`}
                    >
                      {skill.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${skill.name}`}
                      onClick={() => remove.mutate(skill.id)}
                      className="rounded-r-lg py-1.5 pr-1.5 pl-0.5 text-muted hover:text-danger"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit skill">
        {editing ? <EditSkillForm skill={editing} onDone={() => setEditing(null)} /> : null}
      </Dialog>
    </Card>
  );
}

function EditSkillForm({ skill, onDone }: { skill: SkillItem; onDone: () => void }) {
  const save = useSaveSectionItem('skills');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SkillValues>({
    resolver: zodResolver(skillSchema),
    defaultValues: { name: skill.name, category: skill.category },
  });
  const onSubmit = handleSubmit(async (values) => {
    await save.mutateAsync({
      id: skill.id,
      input: { name: values.name.trim(), category: values.category },
    });
    onDone();
  });
  return (
    <form
      onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
      noValidate
      className="grid gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-skill-name" className="text-sm font-medium">
          Skill
        </label>
        <input
          id="edit-skill-name"
          className={controlClasses(Boolean(errors.name), 'h-10')}
          {...register('name')}
        />
        {errors.name ? <p className="text-sm text-danger">{errors.name.message}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-skill-category" className="text-sm font-medium">
          Category
        </label>
        <Select id="edit-skill-category" {...register('category')}>
          {SKILL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {SKILL_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </div>
      {save.isError ? <Alert>{errorMessage(save.error)}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
