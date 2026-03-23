import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useFlow } from '../hooks/useFlows';
import { FlowTabs } from '../components/flow/FlowTabs';
import { FlowWorkspace } from '../components/flow/FlowWorkspace';
import { FlowPreview } from '../components/flow/FlowPreview';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';

export function FlowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { flow, isLoading, updateFlow } = useFlow(id!);
  const [activeTab, setActiveTab] = useState('form');

  // Listen for banner click to switch to Generate tab
  const handleViewResults = useCallback(() => setActiveTab('run'), []);
  useEffect(() => {
    window.addEventListener('orchestration:viewResults', handleViewResults);
    return () => window.removeEventListener('orchestration:viewResults', handleViewResults);
  }, [handleViewResults]);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  if (isLoading || !flow) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  const handleRename = async () => {
    if (editName.trim() && editName !== flow.name) {
      await updateFlow({ name: editName.trim() });
    }
    setIsEditing(false);
  };

  const handleDelete = () => setShowDeleteModal(true);

  const confirmDelete = async () => {
    const { api } = await import('../lib/api');
    await api.delete(`/flows/${id}`);
    navigate('/dashboard');
  };

  return (
    <div className="flex h-full flex-col -m-6">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm">
              &larr; Back
            </Button>
          </Link>

          {isEditing ? (
            <input
              className="rounded border border-gray-300 px-2 py-1 text-lg font-semibold focus:border-brand-500 focus:outline-none"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              autoFocus
            />
          ) : (
            <h2
              className="cursor-pointer text-lg font-semibold text-gray-900 hover:text-brand-600"
              onClick={() => {
                setEditName(flow.name);
                setIsEditing(true);
              }}
            >
              {flow.name}
            </h2>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
            {flow.status}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <FlowTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        <FlowWorkspace activeTab={activeTab} flow={flow} updateFlow={updateFlow} onDelete={handleDelete} />
        {activeTab === 'form' && <FlowPreview flowName={flow.name} fields={flow.config.fields} />}
      </div>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Orchestration"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        variant="danger"
      >
        <p>Delete this orchestration permanently? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
