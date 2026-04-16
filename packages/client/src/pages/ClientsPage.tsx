import { useEffect, useState } from 'react';
import { Building2, Plus, X } from 'lucide-react';
import { useClients } from '../hooks/useClients';
import { useOrganisation } from '../hooks/useOrganisation';
import { ClientList } from '../components/clients/ClientList';
import { ClientDetail } from '../components/clients/ClientDetail';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import type { CreateClientDTO } from '@cc/shared';

interface ClientsPageProps {
  onRequestNewClient?: () => void;
  externalCreateTrigger?: number; // increment to open create modal externally
}

export function ClientsPage({ externalCreateTrigger }: ClientsPageProps) {
  const { currentOrg } = useOrganisation();
  const {
    clients,
    selectedClient,
    loading,
    detailLoading,
    error,
    fetchClients,
    createClient,
    updateClient,
    selectClient,
    clearSelectedClient,
    addContact,
    updateContact,
    deleteContact,
    addContract,
    updateContract,
    deleteContract,
  } = useClients();

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createIndustry, setCreateIndustry] = useState('');
  const [createWebsite, setCreateWebsite] = useState('');
  const [createSaving, setCreateSaving] = useState(false);

  // Load clients when org changes
  useEffect(() => {
    if (currentOrg?.id) {
      void fetchClients(currentOrg.id);
    }
  }, [currentOrg?.id, fetchClients]);

  // External trigger to open create modal (e.g. from toolbar "+ New Client")
  useEffect(() => {
    if (externalCreateTrigger && externalCreateTrigger > 0) {
      setShowCreate(true);
    }
  }, [externalCreateTrigger]);

  const resetCreateForm = () => {
    setCreateName('');
    setCreateIndustry('');
    setCreateWebsite('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !currentOrg?.id) return;
    setCreateSaving(true);
    try {
      const dto: CreateClientDTO & { organisationId: string } = {
        organisationId: currentOrg.id,
        name: createName.trim(),
        ...(createIndustry.trim() && { industry: createIndustry.trim() }),
        ...(createWebsite.trim() && { website: createWebsite.trim() }),
      };
      const created = await createClient(dto);
      resetCreateForm();
      setShowCreate(false);
      // Auto-select newly created client
      void selectClient(created.id);
    } finally {
      setCreateSaving(false);
    }
  };

  if (!currentOrg) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-accent/10 blur-xl" />
          <div className="relative rounded-2xl bg-surface-2/80 p-5 border border-white/5">
            <Building2 className="h-10 w-10 text-accent/50" />
          </div>
        </div>
        <div>
          <p className="text-base font-semibold text-text-secondary">No organisation selected</p>
          <p className="text-sm text-text-tertiary mt-1">
            Join or create an organisation to manage clients
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-5 h-full min-h-0">
      {/* Left panel — client list */}
      <div className="w-72 shrink-0 flex flex-col gap-3">
        {/* Create button */}
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-subtle bg-surface-2/30 px-3 py-2.5 text-xs font-medium text-text-tertiary hover:border-accent/30 hover:text-accent hover:bg-accent/5 transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          New Client
        </button>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-status-error/10 border border-status-error/20 px-3 py-2 text-xs text-status-error">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <ClientList
              clients={clients}
              selectedId={selectedClient?.id ?? null}
              onSelect={(id) => void selectClient(id)}
              onCreateNew={() => setShowCreate(true)}
            />
          </div>
        )}
      </div>

      {/* Right panel — client detail */}
      <div className="flex-1 min-w-0">
        {detailLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        ) : selectedClient ? (
          <div className="rounded-xl border border-border-subtle bg-surface-2/40 backdrop-blur-glass p-5 h-full flex flex-col">
            {/* Close button */}
            <div className="flex justify-end mb-2 shrink-0">
              <button
                type="button"
                onClick={clearSelectedClient}
                className="p-1.5 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <ClientDetail
                client={selectedClient}
                onUpdate={(dto) => updateClient(selectedClient.id, dto)}
                onAddContact={(dto) => addContact(selectedClient.id, dto)}
                onUpdateContact={(cId, dto) => updateContact(selectedClient.id, cId, dto)}
                onDeleteContact={(cId) => deleteContact(selectedClient.id, cId)}
                onAddContract={(dto) => addContract(selectedClient.id, dto)}
                onUpdateContract={(cId, dto) => updateContract(selectedClient.id, cId, dto)}
                onDeleteContract={(cId) => deleteContract(selectedClient.id, cId)}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-accent/10 blur-2xl scale-150" />
              <div className="relative rounded-2xl bg-surface-2/80 backdrop-blur-glass p-6 border border-white/5 shadow-dark-lg">
                <Building2 className="h-12 w-12 text-accent/40" />
              </div>
            </div>
            <div>
              <p className="text-base font-semibold bg-gradient-to-r from-text-primary to-text-secondary bg-clip-text text-transparent">
                Select a client to view details
              </p>
              <p className="text-sm text-text-tertiary mt-1">
                Or create a new client to get started
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-4 py-2 text-sm font-medium text-surface-0 hover:shadow-[0_0_12px_rgba(255,214,10,0.25)] transition-all"
            >
              <Plus className="h-4 w-4" />
              New Client
            </button>
          </div>
        )}
      </div>

      {/* Create client modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => {
          setShowCreate(false);
          resetCreateForm();
        }}
        title="New Client"
        confirmLabel={createSaving ? 'Creating...' : 'Create'}
        onConfirm={handleCreate as unknown as () => void}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Company Name"
            placeholder="e.g. Acme Corp"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            autoFocus
            required
          />
          <Input
            label="Industry"
            placeholder="e.g. Technology, Finance..."
            value={createIndustry}
            onChange={(e) => setCreateIndustry(e.target.value)}
          />
          <Input
            label="Website"
            placeholder="https://..."
            value={createWebsite}
            onChange={(e) => setCreateWebsite(e.target.value)}
          />
          <button type="submit" className="hidden" />
        </form>
      </Modal>
    </div>
  );
}
