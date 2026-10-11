import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';

export function SectionFormActions({
  onCancel,
  saving,
  error,
}: {
  onCancel: () => void;
  saving: boolean;
  error: unknown;
}) {
  return (
    <div className="mt-2 flex flex-col gap-3">
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save
        </Button>
      </div>
    </div>
  );
}
