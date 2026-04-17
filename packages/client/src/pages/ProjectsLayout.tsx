import { useState, useRef } from 'react';
import { Outlet, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { FolderKanban, Building2, ChevronLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useProjects } from '../hooks/useProjects';
import { useOrganisation } from '../hooks/useOrganisation';
import { ClientsPage } from './ClientsPage';
import type { CreateProjectDTO } from '@cc/shared';

type ActiveTab = 'projects' | 'clients';

export function ProjectsLayout() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { projectId } = useParams<{ projectId?: string }>();
  const isDetailView = !!projectId;

  const activeTab = isDetailView
    ? 'projects'
    : ((searchParams.get('tab') as ActiveTab) ?? 'projects');

  const { createProject } = useProjects();
  const { currentOrg } = useOrganisation();

  // Project create modal
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');

  // Client create trigger
  const clientCreateTrigger = useRef(0);
  const [clientCreateCount, setClientCreateCount] = useState(0);

  const setTab = (tab: ActiveTab) => {
    if (isDetailView && tab === 'projects') {
      navigate('/projects');
    } else if (isDetailView && tab === 'clients') {
      navigate('/projects?tab=clients');
    } else {
      setSearchParams({ tab });
    }
  };

  const handleNewButton = () => {
    if (activeTab === 'clients') {
      clientCreateTrigger.current += 1;
      setClientCreateCount(clientCreateTrigger.current);
    } else {
      setShowCreate(true);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormClientName('');
    setFormStartDate('');
    setFormEndDate('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const dto: CreateProjectDTO = {
      name: formName.trim(),
      ...(formDescription.trim() && { description: formDescription.trim() }),
      ...(formClientName.trim() && { clientName: formClientName.trim() }),
      ...(formStartDate && { startDate: formStartDate }),
      ...(formEndDate && { endDate: formEndDate }),
      ...(currentOrg?.id && { organisationId: currentOrg.id }),
    };

    const project = await createProject(dto);
    resetForm();
    setShowCreate(false);
    navigate(`/projects/${project.id}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Persistent toolbar */}
      <div className="flex items-center justify-between mb-4 shrink-0 rounded-xl bg-surface-1/80 backdrop-blur-sm border border-white/5 px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          {isDetailView && (
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="flex items-center justify-center h-8 w-8 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-3/50 transition-all"
              title="Back to list"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex items-center gap-1 bg-surface-3/50 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setTab('projects')}
              className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === 'projects'
                  ? 'bg-gradient-to-r from-accent/15 to-amber-600/10 text-accent shadow-[0_0_8px_rgba(255,214,10,0.1)] border border-accent/20'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-3/50'
              }`}
            >
              <FolderKanban className="h-4 w-4" />
              Projects
            </button>
            <button
              type="button"
              onClick={() => setTab('clients')}
              className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === 'clients'
                  ? 'bg-gradient-to-r from-accent/15 to-amber-600/10 text-accent shadow-[0_0_8px_rgba(255,214,10,0.1)] border border-accent/20'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-3/50'
              }`}
            >
              <Building2 className="h-4 w-4" />
              Clients
            </button>
          </div>
        </div>

        <Button onClick={handleNewButton}>
          + New {activeTab === 'clients' ? 'Client' : 'Project'}
        </Button>
      </div>

      {/* Tab content */}
      {activeTab === 'clients' ? (
        <div className="flex-1 min-h-0">
          <ClientsPage externalCreateTrigger={clientCreateCount} />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <Outlet />
        </div>
      )}

      {/* Create project modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => {
          setShowCreate(false);
          resetForm();
        }}
        title="New Project"
        confirmLabel="Create"
        onConfirm={handleCreate as unknown as () => void}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Project Name"
            placeholder="e.g. Acme Data Warehouse"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
          />
          <Input
            label="Description"
            placeholder="Brief description..."
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
          />
          <Input
            label="Client"
            placeholder="Client name (optional)"
            value={formClientName}
            onChange={(e) => setFormClientName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Date"
              type="date"
              value={formStartDate}
              onChange={(e) => setFormStartDate(e.target.value)}
            />
            <Input
              label="End Date"
              type="date"
              value={formEndDate}
              onChange={(e) => setFormEndDate(e.target.value)}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
