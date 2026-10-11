import { APPLICATION_NOTE_MAX_LENGTH, type ApplicationNote } from '@job-assist/shared';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Button } from '../../../shared/ui/Button';
import { formatDate } from '../../../shared/ui/format';
import { TextArea } from '../../../shared/ui/TextArea';
import { useApplicationAction } from '../hooks/useApplications';
import { applicationsApi } from '../services/applications-api';

function NoteItem({ applicationId, note }: { applicationId: string; note: ApplicationNote }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.body);
  const save = useApplicationAction(() =>
    applicationsApi.editNote(applicationId, note.id, text.trim()),
  );
  const remove = useApplicationAction(() => applicationsApi.deleteNote(applicationId, note.id));
  return (
    <li className="py-3">
      {editing ? (
        <div className="grid gap-2">
          <label className="sr-only" htmlFor={`note-${note.id}`}>
            Edit note
          </label>
          <TextArea
            id={`note-${note.id}`}
            rows={3}
            value={text}
            maxLength={APPLICATION_NOTE_MAX_LENGTH}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!text.trim()}
              loading={save.isPending}
              onClick={() => save.mutate(undefined, { onSuccess: () => setEditing(false) })}
            >
              Save note
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => (setEditing(false), setText(note.body))}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm whitespace-pre-line">{note.body}</p>
            <p className="mt-1 text-xs text-muted">
              {formatDate(note.createdAt)}
              {Date.parse(note.updatedAt) - Date.parse(note.createdAt) > 1000 ? ' · edited' : ''}
            </p>
          </div>
          <Button size="sm" variant="ghost" aria-label="Edit note" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Delete note"
            loading={remove.isPending}
            onClick={() => remove.mutate(undefined)}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      )}
      {save.error || remove.error ? (
        <p className="text-sm text-danger">{errorMessage(save.error ?? remove.error)}</p>
      ) : null}
    </li>
  );
}

export function ApplicationNotes({
  applicationId,
  notes,
}: {
  applicationId: string;
  notes: ApplicationNote[];
}) {
  const [text, setText] = useState('');
  const add = useApplicationAction(() => applicationsApi.addNote(applicationId, text.trim()));
  return (
    <div>
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate(undefined, { onSuccess: () => setText('') });
        }}
      >
        <label htmlFor="new-note" className="sr-only">
          New note
        </label>
        <TextArea
          id="new-note"
          rows={2}
          value={text}
          maxLength={APPLICATION_NOTE_MAX_LENGTH}
          placeholder="e.g. Recruiter contacted me on LinkedIn."
          onChange={(e) => setText(e.target.value)}
        />
        <div>
          <Button type="submit" size="sm" disabled={!text.trim()} loading={add.isPending}>
            Add note
          </Button>
        </div>
        {add.error ? <p className="text-sm text-danger">{errorMessage(add.error)}</p> : null}
      </form>
      {notes.length > 0 ? (
        <ul className="mt-2 divide-y divide-border" aria-label="Notes">
          {notes.map((n) => (
            <NoteItem key={`${n.id}-${n.updatedAt}`} applicationId={applicationId} note={n} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No notes yet.</p>
      )}
    </div>
  );
}
