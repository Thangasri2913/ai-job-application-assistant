import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from './Button';
import { controlClasses } from './field-styles';

/** Edits a list of free-text lines (responsibilities, achievements…). */
export function ListInput({
  value,
  onChange,
  placeholder,
  addLabel = 'Add',
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const item = draft.trim();
    if (!item) return;
    onChange([...value, item]);
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {value.map((item, index) => (
            <li
              key={`${index}-${item}`}
              className="flex items-start gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm"
            >
              <span className="flex-1">{item}</span>
              <button
                type="button"
                aria-label={`Remove "${item}"`}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                className="text-muted hover:text-danger"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={controlClasses(false, 'h-10')}
        />
        <Button variant="secondary" onClick={add} aria-label={addLabel}>
          <Plus className="size-4" aria-hidden />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
