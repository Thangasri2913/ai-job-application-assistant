import { X } from 'lucide-react';
import { useState } from 'react';
import { controlClasses } from './field-styles';

/** Free-form, user-controlled tags. Enter or comma adds; case-insensitive de-duplication. */
export function TagInput({
  value,
  onChange,
  id,
  placeholder = 'Type a tag and press Enter',
  maxTags = 20,
  maxLength = 40,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  id?: string;
  placeholder?: string;
  maxTags?: number;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const tag = draft.trim().replace(/\s+/g, ' ').slice(0, maxLength);
    setDraft('');
    if (!tag || value.length >= maxTags || value.some((t) => t.toLowerCase() === tag.toLowerCase()))
      return;
    onChange([...value, tag]);
  };
  return (
    <div className={controlClasses(false, 'flex min-h-10 flex-wrap items-center gap-1.5 py-1.5')}>
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : ''}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
}
