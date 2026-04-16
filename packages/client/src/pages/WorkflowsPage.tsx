import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFlows } from '../hooks/useFlows';
import { FlowCard } from '../components/flow/FlowCard';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Workflow } from 'lucide-react';

export function WorkflowsPage() {
  const { flows, isLoading, createFlow, deleteFlow } = useFlows();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFlowName.trim()) return;

    const flow = await createFlow(newFlowName.trim());
    setNewFlowName('');
    setShowCreate(false);
    navigate(`/flows/${flow.id}`);
  };

  const handleDelete = (id: string) => setDeleteId(id);

  const confirmDelete = async () => {
    if (deleteId) {
      await deleteFlow(deleteId);
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Workflows</h1>
          <p className="mt-0.5 text-sm text-text-tertiary">One idea in. Twelve assets out.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New Workflow</Button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 flex gap-3">
          <Input
            label=""
            placeholder="Workflow name..."
            value={newFlowName}
            onChange={(e) => setNewFlowName(e.target.value)}
            autoFocus
          />
          <Button type="submit" size="md">
            Create
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={() => setShowCreate(false)}>
            Cancel
          </Button>
        </form>
      )}

      {flows.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="Nothing brewing yet."
          description="Create a workflow. One idea in, twelve assets out."
          actionLabel="+ New Workflow"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((flow, i) => (
            <div
              key={flow.id}
              className="animate-slide-up"
              style={{ animationDelay: `${i * 75}ms` }}
            >
              <FlowCard flow={flow} onDelete={handleDelete} />
            </div>
          ))}
        </div>
      )}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Workflow"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        variant="danger"
      >
        <p>Permanently delete this workflow and all its configuration? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
