import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFlows } from '../hooks/useFlows';
import { FlowCard } from '../components/flow/FlowCard';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Workflow } from 'lucide-react';

export function DashboardPage() {
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your orchestrations</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New Orchestration</Button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 flex gap-3">
          <Input
            label=""
            placeholder="Orchestration name..."
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
          title="Your content engine starts here"
          description="Create your first orchestration to turn ideas into published content across every channel."
          actionLabel="+ New Orchestration"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((flow) => (
            <FlowCard key={flow.id} flow={flow} onDelete={handleDelete} />
          ))}
        </div>
      )}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Orchestration"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        variant="danger"
      >
        <p>Permanently delete this orchestration and all its configuration? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
