import { useState } from 'react';
import type { Flow } from '@cc/shared';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';

interface DetailsTabProps {
  flow: Flow;
  updateFlow: (updates: Record<string, unknown>) => Promise<unknown>;
  onDelete: () => void;
}

export function DetailsTab({ flow, updateFlow, onDelete }: DetailsTabProps) {
  const [description, setDescription] = useState(flow.description ?? '');
  const [status, setStatus] = useState(flow.status);
  const [isSaving, setIsSaving] = useState(false);

  const handleDescriptionBlur = async () => {
    if (description !== (flow.description ?? '')) {
      setIsSaving(true);
      await updateFlow({ description });
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus as Flow['status']);
    await updateFlow({ status: newStatus });
  };

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <h4 className="mb-4 font-medium text-text-primary">Details</h4>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              placeholder="Describe what this orchestration does..."
              rows={3}
              className="w-full rounded-lg border border-border-default px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:ring-offset-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Status</label>
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full rounded-lg border border-border-default px-3 py-2 text-sm focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:ring-offset-2"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {isSaving && <p className="text-xs text-text-tertiary">Saving...</p>}
        </div>
      </Card>

      <Card padding="lg">
        <h4 className="mb-4 font-medium text-text-primary">Information</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-text-tertiary">Created</p>
            <p className="font-medium">{new Date(flow.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-text-tertiary">Last Updated</p>
            <p className="font-medium">{new Date(flow.updatedAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-text-tertiary">Fields</p>
            <p className="font-medium">{flow.config.fields.length}</p>
          </div>
          <div>
            <p className="text-text-tertiary">Steps</p>
            <p className="font-medium">{flow.config.steps.length}</p>
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <div className="rounded-lg border border-red-500/30 p-4">
          <h4 className="mb-2 font-medium text-red-400">Danger Zone</h4>
          <p className="mb-3 text-sm text-text-tertiary">
            Permanently delete this orchestration and all its configuration. This cannot be undone.
          </p>
          <Button variant="danger" size="sm" onClick={onDelete}>
            Delete Orchestration
          </Button>
        </div>
      </Card>
    </div>
  );
}
