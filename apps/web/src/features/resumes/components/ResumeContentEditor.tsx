import { type ResumeContent, SKILL_CATEGORIES, SKILL_CATEGORY_LABELS } from '@job-assist/shared';
import { Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useImperativeHandle, type Ref } from 'react';
import {
  Controller,
  type Control,
  type UseFormRegister,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Checkbox } from '../../../shared/ui/Checkbox';
import { controlClasses } from '../../../shared/ui/field-styles';
import { FormField } from '../../../shared/ui/FormField';
import { ListInput } from '../../../shared/ui/ListInput';
import { Select } from '../../../shared/ui/Select';
import { TagInput } from '../../../shared/ui/TagInput';
import { TextArea } from '../../../shared/ui/TextArea';
import { type ContentFormValues, fromFormValues, toFormValues } from './resume-content-form';

export interface ContentEditorHandle {
  /** Returns the edited content, or null if the form has validation errors. */
  submit: () => Promise<ResumeContent | null>;
}

const input = (
  register: UseFormRegister<ContentFormValues>,
  name: Parameters<UseFormRegister<ContentFormValues>>[0],
  label: string,
  opts: { type?: string; className?: string; placeholder?: string } = {},
) => (
  <FormField label={label} optional className={opts.className}>
    {(a) => (
      <input
        {...a}
        type={opts.type ?? 'text'}
        placeholder={opts.placeholder}
        className={controlClasses(false, 'h-10')}
        {...register(name)}
      />
    )}
  </FormField>
);

function Group({
  title,
  onAdd,
  addLabel,
  children,
  count,
}: {
  title: string;
  onAdd?: () => void;
  addLabel?: string;
  children: ReactNode;
  count?: number;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          {title}
          {count !== undefined ? (
            <span className="ml-2 text-sm font-normal text-muted">{count}</span>
          ) : null}
        </h2>
        {onAdd ? (
          <Button variant="secondary" size="sm" onClick={onAdd}>
            <Plus className="size-4" aria-hidden />
            {addLabel}
          </Button>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

function Entry({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${title}`}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function ListField({
  control,
  name,
  label,
  kind = 'list',
}: {
  control: Control<ContentFormValues>;
  name: never;
  label: string;
  kind?: 'list' | 'tags';
}) {
  return (
    <FormField label={label} optional className="sm:col-span-2">
      {({ id }) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) =>
            kind === 'tags' ? (
              <TagInput
                id={id}
                value={field.value as string[]}
                onChange={field.onChange}
                maxTags={60}
                maxLength={80}
              />
            ) : (
              <ListInput id={id} value={field.value as string[]} onChange={field.onChange} />
            )
          }
        />
      )}
    </FormField>
  );
}

/** Editable form for structured resume content (used to review extracted data). */
export function ResumeContentEditor({
  initial,
  ref,
}: {
  initial: ResumeContent;
  ref: Ref<ContentEditorHandle>;
}) {
  const { register, control, handleSubmit } = useForm<ContentFormValues>({
    defaultValues: toFormValues(initial),
  });
  const skills = useFieldArray({ control, name: 'skills' });
  const experiences = useFieldArray({ control, name: 'experiences' });
  const educations = useFieldArray({ control, name: 'educations' });
  const projects = useFieldArray({ control, name: 'projects' });
  const certifications = useFieldArray({ control, name: 'certifications' });
  // Live values, used only for entry headings.
  const [expValues, eduValues, projectValues, certValues] = useWatch({
    control,
    name: ['experiences', 'educations', 'projects', 'certifications'],
  });

  useImperativeHandle(ref, () => ({
    submit: () =>
      new Promise<ResumeContent | null>((resolve) => {
        void handleSubmit(
          (values) => resolve(fromFormValues(values)),
          () => resolve(null),
        )();
      }),
  }));

  return (
    <div className="flex flex-col gap-6">
      <Group title="Contact">
        <div className="grid gap-3 sm:grid-cols-2">
          {input(register, 'contact.fullName', 'Name')}
          {input(register, 'contact.email', 'Email', { type: 'email' })}
          {input(register, 'contact.phone', 'Phone')}
          {input(register, 'contact.location', 'Location')}
          {input(register, 'contact.linkedinUrl', 'LinkedIn', {
            type: 'url',
            placeholder: 'https://',
          })}
          {input(register, 'contact.githubUrl', 'GitHub', { type: 'url', placeholder: 'https://' })}
          {input(register, 'contact.portfolioUrl', 'Portfolio', {
            type: 'url',
            placeholder: 'https://',
          })}
        </div>
      </Group>

      <Group title="Summary">
        <div className="mb-3">{input(register, 'headline', 'Headline')}</div>
        <label htmlFor="content-summary" className="sr-only">
          Summary
        </label>
        <TextArea id="content-summary" rows={4} {...register('summary')} />
        <div className="mt-3 max-w-xs">
          {input(register, 'estimatedYearsOfExperience', 'Total experience (years)')}
          <p className="mt-1 text-xs text-muted">
            Estimated from the dates in the file. Correct it if it’s wrong.
          </p>
        </div>
      </Group>

      <Group
        title="Skills"
        count={skills.fields.length}
        onAdd={() => skills.append({ name: '', category: 'OTHER' })}
        addLabel="Add skill"
      >
        {skills.fields.length === 0 ? <p className="text-sm text-muted">No skills found.</p> : null}
        <ul className="grid gap-2 sm:grid-cols-2">
          {skills.fields.map((field, index) => (
            <li key={field.id} className="flex gap-2">
              <label className="sr-only" htmlFor={`skill-${index}`}>
                Skill {index + 1}
              </label>
              <input
                id={`skill-${index}`}
                className={controlClasses(false, 'h-9 flex-1')}
                {...register(`skills.${index}.name`)}
              />
              <label className="sr-only" htmlFor={`skill-cat-${index}`}>
                Category for skill {index + 1}
              </label>
              <Select
                id={`skill-cat-${index}`}
                className="h-9 w-36"
                {...register(`skills.${index}.category`)}
              >
                {SKILL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {SKILL_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => skills.remove(index)}
                aria-label={`Remove skill ${index + 1}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </Group>

      <Group
        title="Experience"
        count={experiences.fields.length}
        addLabel="Add experience"
        onAdd={() =>
          experiences.append({
            company: '',
            jobTitle: '',
            location: '',
            startDate: '',
            endDate: '',
            isCurrent: false,
            responsibilities: [],
            achievements: [],
            technologies: [],
          })
        }
      >
        <div className="grid gap-3">
          {experiences.fields.length === 0 ? (
            <p className="text-sm text-muted">No experience found.</p>
          ) : null}
          {experiences.fields.map((field, i) => (
            <Entry
              key={field.id}
              title={expValues[i]?.jobTitle || expValues[i]?.company || `Experience ${i + 1}`}
              onRemove={() => experiences.remove(i)}
            >
              {input(register, `experiences.${i}.jobTitle`, 'Job title')}
              {input(register, `experiences.${i}.company`, 'Company')}
              {input(register, `experiences.${i}.location`, 'Location')}
              <div className="flex items-end pb-2">
                <Checkbox label="Current position" {...register(`experiences.${i}.isCurrent`)} />
              </div>
              {input(register, `experiences.${i}.startDate`, 'Start', { type: 'month' })}
              {input(register, `experiences.${i}.endDate`, 'End', { type: 'month' })}
              <ListField
                control={control}
                name={`experiences.${i}.responsibilities` as never}
                label="Responsibilities"
              />
              <ListField
                control={control}
                name={`experiences.${i}.achievements` as never}
                label="Achievements"
              />
              <ListField
                control={control}
                name={`experiences.${i}.technologies` as never}
                label="Technologies"
                kind="tags"
              />
            </Entry>
          ))}
        </div>
      </Group>

      <Group
        title="Education"
        count={educations.fields.length}
        addLabel="Add education"
        onAdd={() =>
          educations.append({
            institution: '',
            degree: '',
            fieldOfStudy: '',
            startDate: '',
            endDate: '',
            grade: '',
          })
        }
      >
        <div className="grid gap-3">
          {educations.fields.length === 0 ? (
            <p className="text-sm text-muted">No education found.</p>
          ) : null}
          {educations.fields.map((field, i) => (
            <Entry
              key={field.id}
              title={eduValues[i]?.institution || `Education ${i + 1}`}
              onRemove={() => educations.remove(i)}
            >
              {input(register, `educations.${i}.institution`, 'Institution', {
                className: 'sm:col-span-2',
              })}
              {input(register, `educations.${i}.degree`, 'Degree')}
              {input(register, `educations.${i}.fieldOfStudy`, 'Field of study')}
              {input(register, `educations.${i}.startDate`, 'Start', { type: 'month' })}
              {input(register, `educations.${i}.endDate`, 'End', { type: 'month' })}
              {input(register, `educations.${i}.grade`, 'Grade / GPA')}
            </Entry>
          ))}
        </div>
      </Group>

      <Group
        title="Projects"
        count={projects.fields.length}
        addLabel="Add project"
        onAdd={() =>
          projects.append({ name: '', description: '', technologies: [], highlights: [], url: '' })
        }
      >
        <div className="grid gap-3">
          {projects.fields.length === 0 ? (
            <p className="text-sm text-muted">No projects found.</p>
          ) : null}
          {projects.fields.map((field, i) => (
            <Entry
              key={field.id}
              title={projectValues[i]?.name || `Project ${i + 1}`}
              onRemove={() => projects.remove(i)}
            >
              {input(register, `projects.${i}.name`, 'Name')}
              {input(register, `projects.${i}.url`, 'URL', {
                type: 'url',
                placeholder: 'https://',
              })}
              {input(register, `projects.${i}.description`, 'Description', {
                className: 'sm:col-span-2',
              })}
              <ListField
                control={control}
                name={`projects.${i}.highlights` as never}
                label="Highlights"
              />
              <ListField
                control={control}
                name={`projects.${i}.technologies` as never}
                label="Technologies"
                kind="tags"
              />
            </Entry>
          ))}
        </div>
      </Group>

      <Group
        title="Certifications"
        count={certifications.fields.length}
        addLabel="Add certification"
        onAdd={() => certifications.append({ name: '', issuer: '', date: '' })}
      >
        <div className="grid gap-3">
          {certifications.fields.length === 0 ? (
            <p className="text-sm text-muted">No certifications found.</p>
          ) : null}
          {certifications.fields.map((field, i) => (
            <Entry
              key={field.id}
              title={certValues[i]?.name || `Certification ${i + 1}`}
              onRemove={() => certifications.remove(i)}
            >
              {input(register, `certifications.${i}.name`, 'Name')}
              {input(register, `certifications.${i}.issuer`, 'Issuer')}
              {input(register, `certifications.${i}.date`, 'Date', { type: 'month' })}
            </Entry>
          ))}
        </div>
      </Group>

      <Group title="Achievements">
        <Controller
          control={control}
          name="achievements"
          render={({ field }) => (
            <ListInput
              value={field.value}
              onChange={field.onChange}
              placeholder="An award or accomplishment from your resume"
            />
          )}
        />
      </Group>

      <Group title="Languages">
        <Controller
          control={control}
          name="languages"
          render={({ field }) => (
            <ListInput
              value={field.value}
              onChange={field.onChange}
              placeholder="A language as written in your resume"
            />
          )}
        />
      </Group>
    </div>
  );
}
