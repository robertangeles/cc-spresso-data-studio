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
        <h4 className="mb-4 font-medium text-gray-900">Details</h4>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              placeholder="Describe what this orchestration does..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {isSaving && <p className="text-xs text-gray-400">Saving...</p>}
        </div>
      </Card>

      <Card padding="lg">
        <h4 className="mb-4 font-medium text-gray-900">Information</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Created</p>
            <p className="font-medium">{new Date(flow.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-gray-500">Last Updated</p>
            <p className="font-medium">{new Date(flow.updatedAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-gray-500">Fields</p>
            <p className="font-medium">{flow.config.fields.length}</p>
          </div>
          <div>
            <p className="text-gray-500">Steps</p>
            <p className="font-medium">{flow.config.steps.length}</p>
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <div className="rounded-lg border border-red-200 p-4">
          <h4 className="mb-2 font-medium text-red-700">Danger Zone</h4>
          <p className="mb-3 text-sm text-gray-500">
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
