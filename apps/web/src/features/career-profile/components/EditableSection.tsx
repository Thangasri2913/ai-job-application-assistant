import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { Dialog } from '../../../shared/ui/Dialog';

function move(ids: string[], from: number, to: number): string[] {
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

/**
 * A profile list section (experience, education…): list + add/edit dialog + delete confirmation.
 * The section supplies how to render an item and the form used to create/edit one.
 */
export function EditableSection<T extends { id: string }>({
  id,
  title,
  itemLabel,
  items,
  emptyText,
  renderItem,
  renderForm,
  onDelete,
  deleting,
  onReorder,
}: {
  id: string;
  title: string;
  itemLabel: string;
  items: T[];
  emptyText: string;
  renderItem: (item: T) => ReactNode;
  renderForm: (props: { item: T | null; onDone: () => void }) => ReactNode;
  onDelete: (id: string) => Promise<unknown>;
  /** When provided, items show move up/down controls; receives the full new id order. */
  onReorder?: (ids: string[]) => void;
  deleting: boolean;
}) {
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<T | null>(null);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  return (
    <Card aria-labelledby={`${id}-heading`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className="text-base font-semibold">
          {title}
        </h2>
        <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden />
          Add {itemLabel}
        </Button>
      </div>

      {deleteError ? (
        <div className="mb-3">
          <Alert>{errorMessage(deleteError)}</Alert>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">{renderItem(item)}</div>
              <div className="flex shrink-0 gap-1">
                {onReorder && items.length > 1 ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Move ${itemLabel} up`}
                      disabled={index === 0}
                      onClick={() =>
                        onReorder(
                          move(
                            items.map((i) => i.id),
                            index,
                            index - 1,
                          ),
                        )
                      }
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Move ${itemLabel} down`}
                      disabled={index === items.length - 1}
                      onClick={() =>
                        onReorder(
                          move(
                            items.map((i) => i.id),
                            index,
                            index + 1,
                          ),
                        )
                      }
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${itemLabel}`}
                  onClick={() => setEditing(item)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${itemLabel}`}
                  onClick={() => setToDelete(item)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? `Add ${itemLabel}` : `Edit ${itemLabel}`}
        size="lg"
      >
        {editing !== null
          ? renderForm({ item: editing === 'new' ? null : editing, onDone: () => setEditing(null) })
          : null}
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        title={`Delete this ${itemLabel}?`}
        confirmLabel="Delete"
        loading={deleting}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (!toDelete) return;
          setDeleteError(null);
          onDelete(toDelete.id)
            .catch((error: unknown) => setDeleteError(error))
            .finally(() => setToDelete(null));
        }}
      >
        This removes it from your career profile. Resumes you have already saved are not changed.
      </ConfirmDialog>
    </Card>
  );
}
