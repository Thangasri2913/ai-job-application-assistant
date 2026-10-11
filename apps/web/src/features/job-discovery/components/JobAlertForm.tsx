import {
  ALERT_RESUME_MODE_LABELS,
  ALERT_RESUME_MODES,
  ALERT_SCHEDULE_LABELS,
  ALERT_SCHEDULE_TYPES,
  type AlertResumeMode,
  type AlertScheduleType,
  type CreateJobAlertRequest,
  DEFAULT_MINIMUM_MATCH_SCORE,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  type EmploymentType,
  JOB_ALERT_MAX_KEYWORDS,
  JOB_ALERT_MAX_LOCATIONS,
  JOB_ALERT_NAME_MAX_LENGTH,
  JOB_ALERT_TERM_MAX_LENGTH,
  type JobAlertItem,
  REMOTE_PREFERENCE_LABELS,
  REMOTE_PREFERENCES,
  type RemotePreference,
  SENIORITY_LABELS,
  SENIORITY_LEVELS,
  type SeniorityLevel,
  WEEKDAY_LABELS,
} from '@job-assist/shared';
import { type FormEvent, useState } from 'react';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { Checkbox } from '../../../shared/ui/Checkbox';
import { FormField } from '../../../shared/ui/FormField';
import { Select } from '../../../shared/ui/Select';
import { TagInput } from '../../../shared/ui/TagInput';
import { TextField } from '../../../shared/ui/TextField';
import { browserTimeZone } from './alert-format';

interface Draft {
  name: string;
  keywords: string[];
  locations: string[];
  remotePreference: RemotePreference;
  employmentTypes: EmploymentType[];
  experienceLevel: SeniorityLevel | '';
  minimumMatchScore: string;
  resumeMode: AlertResumeMode;
  scheduleType: AlertScheduleType;
  time: string;
  days: number[];
  timezone: string;
}

function initialDraft(alert?: JobAlertItem): Draft {
  return alert
    ? {
        name: alert.name,
        keywords: alert.keywords,
        locations: alert.locations,
        remotePreference: alert.remotePreference,
        employmentTypes: alert.employmentTypes,
        experienceLevel: alert.experienceLevel ?? '',
        minimumMatchScore: String(alert.minimumMatchScore),
        resumeMode: alert.resumeMode,
        scheduleType: alert.schedule.type,
        time: alert.schedule.time,
        days: alert.schedule.days,
        timezone: alert.schedule.timezone,
      }
    : {
        name: '',
        keywords: [],
        locations: [],
        remotePreference: 'ANY',
        employmentTypes: [],
        experienceLevel: '',
        minimumMatchScore: String(DEFAULT_MINIMUM_MATCH_SCORE),
        resumeMode: 'BEST_MATCH',
        scheduleType: 'DAILY',
        time: '08:00',
        days: [],
        timezone: browserTimeZone(),
      };
}

export function JobAlertForm({
  alert,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  alert?: JobAlertItem;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (body: CreateJobAlertRequest) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(() => initialDraft(alert));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setD((prev) => ({ ...prev, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    const score = Number(d.minimumMatchScore);
    if (!d.name.trim()) next.name = 'Give the alert a name.';
    if (d.keywords.length === 0)
      next.keywords = 'Add at least one keyword (press Enter after each).';
    if (!Number.isInteger(score) || score < 0 || score > 100)
      next.minimumMatchScore = 'Enter a whole number from 0 to 100.';
    if (d.scheduleType === 'WEEKLY' && d.days.length !== 1) next.days = 'Choose one day.';
    if (d.scheduleType === 'CUSTOM' && d.days.length === 0) next.days = 'Choose at least one day.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({
      name: d.name.trim(),
      keywords: d.keywords,
      locations: d.locations,
      remotePreference: d.remotePreference,
      employmentTypes: d.employmentTypes,
      experienceLevel: d.experienceLevel || null,
      minimumMatchScore: score,
      resumeMode: d.resumeMode,
      schedule: {
        type: d.scheduleType,
        time: d.time,
        days: d.scheduleType === 'DAILY' ? [] : d.days,
        timezone: d.timezone,
      },
    });
  };

  const toggleDay = (day: number) =>
    set(
      'days',
      d.scheduleType === 'WEEKLY'
        ? [day]
        : d.days.includes(day)
          ? d.days.filter((x) => x !== day)
          : [...d.days, day].sort(),
    );

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {error ? <Alert>{error}</Alert> : null}
      <TextField
        label="Alert name"
        value={d.name}
        maxLength={JOB_ALERT_NAME_MAX_LENGTH}
        error={errors.name}
        onChange={(e) => set('name', e.target.value)}
      />
      <FormField
        label="Keywords"
        hint="Job titles or skills, e.g. Frontend Developer, Angular. Press Enter after each."
        error={errors.keywords}
      >
        {({ id }) => (
          <TagInput
            id={id}
            value={d.keywords}
            onChange={(v) => set('keywords', v)}
            maxTags={JOB_ALERT_MAX_KEYWORDS}
            maxLength={JOB_ALERT_TERM_MAX_LENGTH}
            placeholder="Type a keyword and press Enter"
          />
        )}
      </FormField>
      <FormField
        label="Locations"
        optional
        hint="Cities; remote jobs are included unless you choose On-site."
      >
        {({ id }) => (
          <TagInput
            id={id}
            value={d.locations}
            onChange={(v) => set('locations', v)}
            maxTags={JOB_ALERT_MAX_LOCATIONS}
            maxLength={JOB_ALERT_TERM_MAX_LENGTH}
            placeholder="Type a city and press Enter"
          />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Work arrangement">
          {(p) => (
            <Select
              {...p}
              value={d.remotePreference}
              onChange={(e) => set('remotePreference', e.target.value as RemotePreference)}
            >
              {REMOTE_PREFERENCES.map((r) => (
                <option key={r} value={r}>
                  {REMOTE_PREFERENCE_LABELS[r]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Experience level" optional>
          {(p) => (
            <Select
              {...p}
              value={d.experienceLevel}
              onChange={(e) => set('experienceLevel', e.target.value as SeniorityLevel | '')}
            >
              <option value="">Any</option>
              {SENIORITY_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {SENIORITY_LABELS[l]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">
          Employment type <span className="font-normal text-muted">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {EMPLOYMENT_TYPES.map((t) => (
            <Checkbox
              key={t}
              label={EMPLOYMENT_TYPE_LABELS[t]}
              checked={d.employmentTypes.includes(t)}
              onChange={(e) =>
                set(
                  'employmentTypes',
                  e.target.checked
                    ? [...d.employmentTypes, t]
                    : d.employmentTypes.filter((x) => x !== t),
                )
              }
            />
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Minimum match score (%)"
          type="number"
          min={0}
          max={100}
          value={d.minimumMatchScore}
          error={errors.minimumMatchScore}
          hint="Only jobs at or above this compatibility score are recommended."
          onChange={(e) => set('minimumMatchScore', e.target.value)}
        />
        <FormField label="Match against">
          {(p) => (
            <Select
              {...p}
              value={d.resumeMode}
              onChange={(e) => set('resumeMode', e.target.value as AlertResumeMode)}
            >
              {ALERT_RESUME_MODES.map((m) => (
                <option key={m} value={m}>
                  {ALERT_RESUME_MODE_LABELS[m]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Schedule">
          {(p) => (
            <Select
              {...p}
              value={d.scheduleType}
              onChange={(e) => {
                const type = e.target.value as AlertScheduleType;
                setD((prev) => ({
                  ...prev,
                  scheduleType: type,
                  days: type === 'WEEKLY' ? prev.days.slice(0, 1) : prev.days,
                }));
              }}
            >
              {ALERT_SCHEDULE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ALERT_SCHEDULE_LABELS[t]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <TextField
          label="Time"
          type="time"
          value={d.time}
          onChange={(e) => set('time', e.target.value)}
        />
        <TextField
          label="Time zone"
          value={d.timezone}
          hint="Detected from your browser."
          onChange={(e) => set('timezone', e.target.value)}
        />
      </div>
      {d.scheduleType !== 'DAILY' ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">
            {d.scheduleType === 'WEEKLY' ? 'Day' : 'Days'}
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {WEEKDAY_LABELS.map((label, day) => (
              <Checkbox
                key={label}
                label={label}
                checked={d.days.includes(day)}
                onChange={() => toggleDay(day)}
              />
            ))}
          </div>
          {errors.days ? <p className="text-sm text-danger">{errors.days}</p> : null}
        </fieldset>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {alert ? 'Save alert' : 'Create alert'}
        </Button>
      </div>
    </form>
  );
}
