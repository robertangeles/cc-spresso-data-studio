import { useState } from 'react';
import { Mail, Phone, Star, Plus, Edit3, Trash2 } from 'lucide-react';
import type {
  ClientContactRecord,
  CreateClientContactDTO,
  UpdateClientContactDTO,
} from '@cc/shared';

interface ContactsListProps {
  contacts: ClientContactRecord[];
  clientId: string;
  onAdd: (dto: CreateClientContactDTO) => Promise<void>;
  onUpdate: (contactId: string, dto: UpdateClientContactDTO) => Promise<void>;
  onDelete: (contactId: string) => Promise<void>;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
];

function avatarColor(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

interface ContactFormState {
  name: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
}

const emptyForm: ContactFormState = { name: '', email: '', phone: '', role: '', isPrimary: false };

export function ContactsList({
  contacts,
  clientId: _clientId,
  onAdd,
  onUpdate,
  onDelete,
}: ContactsListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<ContactFormState>(emptyForm);
  const [addSaving, setAddSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ContactFormState>(emptyForm);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim()) return;
    setAddSaving(true);
    try {
      await onAdd({
        name: addForm.name.trim(),
        ...(addForm.email.trim() && { email: addForm.email.trim() }),
        ...(addForm.phone.trim() && { phone: addForm.phone.trim() }),
        ...(addForm.role.trim() && { role: addForm.role.trim() }),
        isPrimary: addForm.isPrimary,
      });
      setAddForm(emptyForm);
      setShowAdd(false);
    } finally {
      setAddSaving(false);
    }
  };

  const startEdit = (c: ClientContactRecord) => {
    setEditingId(c.id);
    setEditForm({
      name: c.name,
      email: c.email ?? '',
      phone: c.phone ?? '',
      role: c.role ?? '',
      isPrimary: c.isPrimary,
    });
  };

  const handleUpdate = async (contactId: string) => {
    if (!editForm.name.trim()) return;
    setEditSaving(true);
    try {
      await onUpdate(contactId, {
        name: editForm.name.trim(),
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        role: editForm.role.trim() || undefined,
        isPrimary: editForm.isPrimary,
      });
      setEditingId(null);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (contactId: string) => {
    setDeleteSaving(true);
    try {
      await onDelete(contactId);
      setDeleteId(null);
    } finally {
      setDeleteSaving(false);
    }
  };

  const handleSetPrimary = async (contact: ClientContactRecord) => {
    await onUpdate(contact.id, { isPrimary: true });
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
        </p>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 rounded-lg bg-surface-3/60 border border-white/5 px-2.5 py-1 text-xs text-text-secondary hover:text-accent hover:border-accent/20 transition-all"
        >
          <Plus className="h-3 w-3" />
          Add Contact
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3 animate-slide-up"
        >
          <p className="text-xs font-semibold text-accent uppercase tracking-wider">New Contact</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <input
                autoFocus
                required
                placeholder="Full name *"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
              />
            </div>
            <input
              type="email"
              placeholder="Email"
              value={addForm.email}
              onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
              className="rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={addForm.phone}
              onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
              className="rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
            />
            <input
              placeholder="Role / title"
              value={addForm.role}
              onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
              className="rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
            />
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={addForm.isPrimary}
                onChange={(e) => setAddForm((f) => ({ ...f, isPrimary: e.target.checked }))}
                className="rounded border-border-subtle accent-amber-500"
              />
              Primary contact
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setAddForm(emptyForm);
              }}
              className="rounded-lg px-3 py-1.5 text-sm text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addSaving || !addForm.name.trim()}
              className="rounded-lg bg-gradient-to-r from-accent to-amber-600 px-3 py-1.5 text-sm font-medium text-surface-0 hover:shadow-[0_0_12px_rgba(255,214,10,0.25)] disabled:opacity-50 transition-all"
            >
              {addSaving ? 'Saving...' : 'Add Contact'}
            </button>
          </div>
        </form>
      )}

      {/* Contact list */}
      {contacts.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-center rounded-xl border border-dashed border-border-subtle">
          <p className="text-sm text-text-tertiary">No contacts yet</p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="text-xs text-accent hover:underline"
          >
            Add the first contact
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <div key={contact.id}>
              {editingId === contact.id ? (
                /* Edit mode */
                <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3 animate-slide-up">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <input
                        autoFocus
                        required
                        placeholder="Full name *"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
                      />
                    </div>
                    <input
                      type="email"
                      placeholder="Email"
                      value={editForm.email}
                      onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                      className="rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={editForm.phone}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                      className="rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
                    />
                    <input
                      placeholder="Role / title"
                      value={editForm.role}
                      onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                      className="rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
                    />
                    <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.isPrimary}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, isPrimary: e.target.checked }))
                        }
                        className="rounded border-border-subtle accent-amber-500"
                      />
                      Primary contact
                    </label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg px-3 py-1.5 text-sm text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleUpdate(contact.id)}
                      disabled={editSaving}
                      className="rounded-lg bg-gradient-to-r from-accent to-amber-600 px-3 py-1.5 text-sm font-medium text-surface-0 hover:shadow-[0_0_12px_rgba(255,214,10,0.25)] disabled:opacity-50 transition-all"
                    >
                      {editSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : deleteId === contact.id ? (
                /* Delete confirmation */
                <div className="rounded-xl border border-status-error/20 bg-status-error-dim/30 p-3 flex items-center justify-between gap-2 animate-slide-up">
                  <p className="text-sm text-text-secondary">Delete {contact.name}?</p>
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
                      onClick={() => void handleDelete(contact.id)}
                      disabled={deleteSaving}
                      className="rounded px-2 py-1 text-xs font-medium text-status-error hover:bg-status-error/10 disabled:opacity-50 transition-all"
                    >
                      {deleteSaving ? '...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <div className="group rounded-xl border border-border-subtle bg-surface-2/40 p-3 hover:border-white/10 hover:bg-surface-2/60 transition-all">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                      className={`shrink-0 h-9 w-9 rounded-full bg-gradient-to-br ${avatarColor(contact.name)} flex items-center justify-center text-xs font-bold text-white shadow-sm`}
                    >
                      {getInitials(contact.name)}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary truncate">
                          {contact.name}
                        </span>
                        {contact.isPrimary && (
                          <span className="flex items-center gap-0.5 rounded-full bg-accent/15 border border-accent/20 px-1.5 py-0.5 text-[9px] font-semibold text-accent uppercase tracking-wider">
                            <Star className="h-2.5 w-2.5 fill-accent" />
                            Primary
                          </span>
                        )}
                        {contact.role && (
                          <span className="rounded-full bg-surface-3/80 border border-white/5 px-2 py-0.5 text-[10px] text-text-tertiary">
                            {contact.role}
                          </span>
                        )}
                      </div>
                      {contact.email && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Mail className="h-3 w-3 text-text-tertiary shrink-0" />
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-xs text-text-tertiary hover:text-accent transition-colors truncate"
                          >
                            {contact.email}
                          </a>
                        </div>
                      )}
                      {contact.phone && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Phone className="h-3 w-3 text-text-tertiary shrink-0" />
                          <a
                            href={`tel:${contact.phone}`}
                            className="text-xs text-text-tertiary hover:text-accent transition-colors"
                          >
                            {contact.phone}
                          </a>
                        </div>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {!contact.isPrimary && (
                        <button
                          type="button"
                          onClick={() => void handleSetPrimary(contact)}
                          title="Set as primary"
                          className="p-1.5 rounded-md text-text-tertiary hover:text-accent hover:bg-accent/10 transition-all"
                        >
                          <Star className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => startEdit(contact)}
                        className="p-1.5 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(contact.id)}
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
