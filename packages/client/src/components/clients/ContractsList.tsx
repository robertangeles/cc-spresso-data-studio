import { useState } from 'react';
import { FileText, Calendar, DollarSign, Plus, Edit3, Trash2, Shield } from 'lucide-react';
import type { ClientContract, CreateClientContractDTO, UpdateClientContractDTO } from '@cc/shared';

interface ContractsListProps {
  contracts: ClientContract[];
  clientId: string;
  onAdd: (dto: CreateClientContractDTO) => Promise<void>;
  onUpdate: (contractId: string, dto: UpdateClientContractDTO) => Promise<void>;
  onDelete: (contractId: string) => Promise<void>;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  completed: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  cancelled: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
};

const TYPE_STYLES: Record<string, string> = {
  'fixed-price': 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  'time-materials': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  retainer: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  sow: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  AUD: 'A$',
  GBP: '£',
  EUR: '€',
  CAD: 'C$',
  NZD: 'NZ$',
};

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface ContractFormState {
  name: string;
  contractType: string;
  status: string;
  startDate: string;
  endDate: string;
  billingRate: string;
  billingCurrency: string;
  slaTerms: string;
  notes: string;
}

const emptyForm: ContractFormState = {
  name: '',
  contractType: '',
  status: 'draft',
  startDate: '',
  endDate: '',
  billingRate: '',
  billingCurrency: 'AUD',
  slaTerms: '',
  notes: '',
};

function ContractForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: ContractFormState;
  onSave: (f: ContractFormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set =
    (k: keyof ContractFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3 animate-slide-up">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <input
            autoFocus
            required
            placeholder="Contract name *"
            value={form.name}
            onChange={set('name')}
            className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
          />
        </div>
        <select
          value={form.contractType}
          onChange={set('contractType')}
          className="rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary focus:border-accent/40 focus:outline-none [color-scheme:dark] transition-all"
        >
          <option value="">Type...</option>
          <option value="fixed-price">Fixed Price</option>
          <option value="time-materials">Time & Materials</option>
          <option value="retainer">Retainer</option>
          <option value="sow">Statement of Work</option>
        </select>
        <select
          value={form.status}
          onChange={set('status')}
          className="rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary focus:border-accent/40 focus:outline-none [color-scheme:dark] transition-all"
        >
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div>
          <label className="text-[10px] text-text-tertiary mb-1 block">Start Date</label>
          <input
            type="date"
            value={form.startDate}
            onChange={set('startDate')}
            className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary focus:border-accent/40 focus:outline-none [color-scheme:dark] transition-all"
          />
        </div>
        <div>
          <label className="text-[10px] text-text-tertiary mb-1 block">End Date</label>
          <input
            type="date"
            value={form.endDate}
            onChange={set('endDate')}
            className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary focus:border-accent/40 focus:outline-none [color-scheme:dark] transition-all"
          />
        </div>
        <input
          type="number"
          placeholder="Billing rate"
          value={form.billingRate}
          onChange={set('billingRate')}
          className="rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
        />
        <select
          value={form.billingCurrency}
          onChange={set('billingCurrency')}
          className="rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary focus:border-accent/40 focus:outline-none [color-scheme:dark] transition-all"
        >
          <option value="AUD">AUD</option>
          <option value="USD">USD</option>
          <option value="GBP">GBP</option>
          <option value="EUR">EUR</option>
          <option value="CAD">CAD</option>
          <option value="NZD">NZD</option>
        </select>
        <div className="col-span-2">
          <textarea
            placeholder="Notes..."
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all resize-none"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim()}
          className="rounded-lg bg-gradient-to-r from-accent to-amber-600 px-3 py-1.5 text-sm font-medium text-surface-0 hover:shadow-[0_0_12px_rgba(255,214,10,0.25)] disabled:opacity-50 transition-all"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export function ContractsList({
  contracts,
  clientId: _clientId,
  onAdd,
  onUpdate,
  onDelete,
}: ContractsListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const handleAdd = async (form: ContractFormState) => {
    if (!form.name.trim()) return;
    setAddSaving(true);
    try {
      await onAdd({
        name: form.name.trim(),
        ...(form.contractType && { contractType: form.contractType }),
        status: form.status,
        ...(form.startDate && { startDate: form.startDate }),
        ...(form.endDate && { endDate: form.endDate }),
        ...(form.billingRate && { billingRate: parseFloat(form.billingRate) }),
        billingCurrency: form.billingCurrency,
        ...(form.notes.trim() && { notes: form.notes.trim() }),
      });
      setShowAdd(false);
    } finally {
      setAddSaving(false);
    }
  };

  const handleUpdate = async (contractId: string, form: ContractFormState) => {
    if (!form.name.trim()) return;
    setEditSaving(true);
    try {
      await onUpdate(contractId, {
        name: form.name.trim(),
        contractType: form.contractType || undefined,
        status: form.status,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        billingRate: form.billingRate ? parseFloat(form.billingRate) : undefined,
        billingCurrency: form.billingCurrency,
        notes: form.notes.trim() || undefined,
      });
      setEditingId(null);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (contractId: string) => {
    setDeleteSaving(true);
    try {
      await onDelete(contractId);
      setDeleteId(null);
    } finally {
      setDeleteSaving(false);
    }
  };

  const contractToForm = (c: ClientContract): ContractFormState => ({
    name: c.name,
    contractType: c.contractType ?? '',
    status: c.status,
    startDate: c.startDate?.split('T')[0] ?? '',
    endDate: c.endDate?.split('T')[0] ?? '',
    billingRate: c.billingRate ?? '',
    billingCurrency: c.billingCurrency,
    slaTerms: c.slaTerms ?? '',
    notes: c.notes ?? '',
  });

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          {contracts.length} contract{contracts.length !== 1 ? 's' : ''}
        </p>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 rounded-lg bg-surface-3/60 border border-white/5 px-2.5 py-1 text-xs text-text-secondary hover:text-accent hover:border-accent/20 transition-all"
        >
          <Plus className="h-3 w-3" />
          Add Contract
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <ContractForm
          initial={emptyForm}
          onSave={(f) => void handleAdd(f)}
          onCancel={() => setShowAdd(false)}
          saving={addSaving}
        />
      )}

      {/* Contract list */}
      {contracts.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-center rounded-xl border border-dashed border-border-subtle">
          <FileText className="h-6 w-6 text-text-tertiary/50" />
          <p className="text-sm text-text-tertiary">No contracts yet</p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="text-xs text-accent hover:underline"
          >
            Add the first contract
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {contracts.map((contract) => (
            <div key={contract.id}>
              {editingId === contract.id ? (
                <ContractForm
                  initial={contractToForm(contract)}
                  onSave={(f) => void handleUpdate(contract.id, f)}
                  onCancel={() => setEditingId(null)}
                  saving={editSaving}
                />
              ) : deleteId === contract.id ? (
                <div className="rounded-xl border border-status-error/20 bg-status-error-dim/30 p-3 flex items-center justify-between gap-2 animate-slide-up">
                  <p className="text-sm text-text-secondary">
                    Delete &ldquo;{contract.name}&rdquo;?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteId(null)}
                      className="rounded px-2 py-1 text-xs text-text-tertiary hover:bg-surface-3 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(contract.id)}
                      disabled={deleteSaving}
                      className="rounded px-2 py-1 text-xs font-medium text-status-error hover:bg-status-error/10 disabled:opacity-50 transition-all"
                    >
                      {deleteSaving ? '...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="group rounded-xl border border-border-subtle bg-surface-2/40 p-3.5 hover:border-white/10 hover:bg-surface-2/60 transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-sm font-semibold text-text-primary truncate">
                          {contract.name}
                        </span>
                        {contract.contractType && (
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${TYPE_STYLES[contract.contractType] ?? 'bg-surface-3/80 text-text-tertiary border-white/5'}`}
                          >
                            {contract.contractType.replace('-', ' ')}
                          </span>
                        )}
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[contract.status] ?? STATUS_STYLES.draft}`}
                        >
                          {contract.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                        {(contract.startDate || contract.endDate) && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(contract.startDate)}
                            {contract.startDate && contract.endDate && ' — '}
                            {formatDate(contract.endDate)}
                          </span>
                        )}
                        {contract.billingRate && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {CURRENCY_SYMBOLS[contract.billingCurrency] ?? contract.billingCurrency}
                            {contract.billingRate}/hr
                          </span>
                        )}
                        {contract.slaTerms && (
                          <span className="flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            SLA
                          </span>
                        )}
                      </div>

                      {contract.notes && (
                        <p className="mt-1.5 text-xs text-text-tertiary line-clamp-2">
                          {contract.notes}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingId(contract.id)}
                        className="p-1.5 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(contract.id)}
                        className="p-1.5 rounded-md text-text-tertiary hover:text-status-error hover:bg-status-error/10 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
