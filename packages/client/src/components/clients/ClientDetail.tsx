import { useState } from 'react';
import { Globe, MapPin, Building2, FileText, Users, Info, Pencil, Check, X } from 'lucide-react';
import type {
  ClientWithDetails,
  UpdateClientDTO,
  CreateClientContactDTO,
  UpdateClientContactDTO,
  CreateClientContractDTO,
  UpdateClientContractDTO,
} from '@cc/shared';
import { ContactsList } from './ContactsList';
import { ContractsList } from './ContractsList';

interface ClientDetailProps {
  client: ClientWithDetails;
  onUpdate: (dto: UpdateClientDTO) => Promise<void>;
  onAddContact: (dto: CreateClientContactDTO) => Promise<void>;
  onUpdateContact: (contactId: string, dto: UpdateClientContactDTO) => Promise<void>;
  onDeleteContact: (contactId: string) => Promise<void>;
  onAddContract: (dto: CreateClientContractDTO) => Promise<void>;
  onUpdateContract: (contractId: string, dto: UpdateClientContractDTO) => Promise<void>;
  onDeleteContract: (contractId: string) => Promise<void>;
}

type Tab = 'info' | 'contacts' | 'contracts';

interface InlineFieldProps {
  label: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  onSave: (val: string) => Promise<void>;
}

function InlineField({ label, value, placeholder, multiline = false, onSave }: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(value);
  };

  const save = async () => {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      void save();
    }
    if (e.key === 'Escape') cancel();
  };

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
        {label}
      </p>
      {editing ? (
        <div className="flex flex-col gap-1">
          {multiline ? (
            <textarea
              autoFocus
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => void save()}
              disabled={saving}
              className="w-full rounded-lg border border-accent/40 bg-surface-2/50 px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all resize-none"
            />
          ) : (
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => void save()}
              disabled={saving}
              className="w-full rounded-lg border border-accent/40 bg-surface-2/50 px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
            />
          )}
          <div className="flex gap-1 justify-end">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                cancel();
              }}
              className="p-1 rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                void save();
              }}
              className="p-1 rounded text-accent hover:bg-accent/10 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="group flex items-start gap-1.5 w-full text-left"
        >
          <span
            className={`flex-1 text-sm ${value ? 'text-text-primary' : 'text-text-tertiary italic'} group-hover:text-accent transition-colors`}
          >
            {value || placeholder}
          </span>
          <Pencil className="h-3 w-3 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 flex-shrink-0" />
        </button>
      )}
    </div>
  );
}

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'info', label: 'Info', icon: Info },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'contracts', label: 'Contracts', icon: FileText },
];

export function ClientDetail({
  client,
  onUpdate,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
  onAddContract,
  onUpdateContract,
  onDeleteContract,
}: ClientDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('info');

  const save = (field: keyof UpdateClientDTO) => async (val: string) => {
    await onUpdate({ [field]: val || null });
  };

  const primaryContact = client.contacts.find((c) => c.isPrimary) ?? client.contacts[0];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-5 pb-4 border-b border-white/5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-xl bg-gradient-to-br from-accent/20 to-amber-600/10 border border-accent/10 p-3 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-text-primary truncate">{client.name}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {client.industry && (
                <span className="rounded-full bg-surface-3/80 border border-white/5 px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                  {client.industry}
                </span>
              )}
              {client.companySize && (
                <span className="text-xs text-text-tertiary">{client.companySize} employees</span>
              )}
              {client.website && (
                <a
                  href={
                    client.website.startsWith('http') ? client.website : `https://${client.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  <Globe className="h-3 w-3" />
                  {client.website.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
            {primaryContact && (
              <p className="mt-1 text-xs text-text-tertiary">
                Contact: {primaryContact.name}
                {primaryContact.email && ` · ${primaryContact.email}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-surface-3/40 rounded-lg p-0.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const count =
            tab.id === 'contacts'
              ? client.contacts.length
              : tab.id === 'contracts'
                ? client.contracts.length
                : null;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? 'bg-surface-1 text-text-primary shadow-sm border border-white/5'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {count !== null && count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-text-tertiary'}`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'info' && (
          <div className="space-y-4 animate-slide-up">
            <div className="grid grid-cols-2 gap-4">
              <InlineField
                label="Company Name"
                value={client.name}
                placeholder="Name..."
                onSave={save('name')}
              />
              <InlineField
                label="Industry"
                value={client.industry ?? ''}
                placeholder="e.g. Technology"
                onSave={save('industry')}
              />
              <InlineField
                label="Website"
                value={client.website ?? ''}
                placeholder="https://..."
                onSave={save('website')}
              />
              <InlineField
                label="Company Size"
                value={client.companySize ?? ''}
                placeholder="e.g. 50-100"
                onSave={save('companySize')}
              />
              <InlineField
                label="ABN / Tax ID"
                value={client.abnTaxId ?? ''}
                placeholder="Tax identification..."
                onSave={save('abnTaxId')}
              />
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2 flex items-center gap-1.5">
                <MapPin className="h-3 w-3" />
                Address
              </p>
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-3/30 border border-white/5 p-3">
                <div className="col-span-2">
                  <InlineField
                    label="Line 1"
                    value={client.addressLine1 ?? ''}
                    placeholder="Street address"
                    onSave={save('addressLine1')}
                  />
                </div>
                <div className="col-span-2">
                  <InlineField
                    label="Line 2"
                    value={client.addressLine2 ?? ''}
                    placeholder="Suite, floor..."
                    onSave={save('addressLine2')}
                  />
                </div>
                <InlineField
                  label="City"
                  value={client.city ?? ''}
                  placeholder="City"
                  onSave={save('city')}
                />
                <InlineField
                  label="State"
                  value={client.state ?? ''}
                  placeholder="State"
                  onSave={save('state')}
                />
                <InlineField
                  label="Postcode"
                  value={client.postalCode ?? ''}
                  placeholder="Postcode"
                  onSave={save('postalCode')}
                />
                <InlineField
                  label="Country"
                  value={client.country ?? ''}
                  placeholder="Country"
                  onSave={save('country')}
                />
              </div>
            </div>

            <InlineField
              label="Notes"
              value={client.notes ?? ''}
              placeholder="Add internal notes..."
              multiline
              onSave={save('notes')}
            />
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="animate-slide-up">
            <ContactsList
              contacts={client.contacts}
              clientId={client.id}
              onAdd={onAddContact}
              onUpdate={onUpdateContact}
              onDelete={onDeleteContact}
            />
          </div>
        )}

        {activeTab === 'contracts' && (
          <div className="animate-slide-up">
            <ContractsList
              contracts={client.contracts}
              clientId={client.id}
              onAdd={onAddContract}
              onUpdate={onUpdateContract}
              onDelete={onDeleteContract}
            />
          </div>
        )}
      </div>
    </div>
  );
}
