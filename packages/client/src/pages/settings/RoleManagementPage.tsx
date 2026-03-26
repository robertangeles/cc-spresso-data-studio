import { useState } from 'react';
import { useRoles } from '../../hooks/useRoles';
import { Modal } from '../../components/ui/Modal';
import type { CreateRoleDTO } from '@cc/shared';

type Tab = 'roles' | 'users';

export function RoleManagementPage() {
  const [activeTab, setActiveTab] = useState<Tab>('roles');
  const { roles, isLoading, error, createRole, updateRole, deleteRole } = useRoles();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateRoleDTO>({
    name: '',
    description: '',
    permissions: [],
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'roles', label: 'Roles' },
    { key: 'users', label: 'Users' },
  ];

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', description: '', permissions: [] });
    setFormError(null);
  };

  const handleEdit = (role: (typeof roles)[0]) => {
    setEditingId(role.id);
    setFormData({
      name: role.name,
      description: role.description ?? '',
      permissions: (role.permissions as string[]) ?? [],
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await updateRole(editingId, formData);
      } else {
        await createRole(formData);
      }
      resetForm();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : 'Failed to save role');
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteRoleId) return;
    try {
      await deleteRole(deleteRoleId);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to delete role';
      setFormError(msg);
    }
    setDeleteRoleId(null);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">User & Role Management</h2>
      <p className="text-sm text-text-secondary mb-6">
        Manage roles and permissions for your team.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-default mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'roles' && (
        <div>
          {/* Add Role button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover"
            >
              + Add Role
            </button>
          </div>

          {/* Inline form */}
          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="mb-6 rounded-lg border border-border-default bg-surface-3 p-4"
            >
              <h3 className="text-sm font-semibold text-text-primary mb-3">
                {editingId ? 'Edit Role' : 'New Role'}
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. editor"
                    pattern="[a-z_]+"
                    title="Lowercase letters and underscores only"
                    required
                    disabled={
                      editingId !== null && roles.find((r) => r.id === editingId)?.isSystem === true
                    }
                    className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary disabled:bg-surface-4"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description ?? ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="What can this role do?"
                    className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary"
                  />
                </div>
              </div>
              {formError && <p className="text-sm text-red-400 mb-3">{formError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-3"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Error state */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400 mb-4">
              {error}
            </div>
          )}

          {/* Loading state */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : (
            /* Roles table */
            <div className="overflow-hidden rounded-lg border border-border-default">
              <table className="w-full text-sm">
                <thead className="bg-surface-3">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">Type</th>
                    <th className="px-4 py-3 text-right font-medium text-text-secondary">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {roles.map((role) => (
                    <tr key={role.id} className="bg-surface-2 hover:bg-surface-3">
                      <td className="px-4 py-3 font-medium text-text-primary">{role.name}</td>
                      <td className="px-4 py-3 text-text-secondary">{role.description ?? '—'}</td>
                      <td className="px-4 py-3">
                        {role.isSystem ? (
                          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                            System
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-text-secondary">
                            Custom
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEdit(role)}
                            className="text-xs font-medium text-accent hover:text-accent-hover"
                          >
                            Edit
                          </button>
                          {!role.isSystem && (
                            <button
                              onClick={() => setDeleteRoleId(role.id)}
                              className="text-xs font-medium text-red-400 hover:text-red-300"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {roles.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-text-tertiary">
                        No roles found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="rounded-lg border border-border-default bg-surface-3 p-8 text-center">
          <p className="text-sm text-text-secondary">User management is coming soon.</p>
          <p className="text-xs text-text-tertiary mt-1">
            You&apos;ll be able to assign roles to users here.
          </p>
        </div>
      )}

      <Modal
        isOpen={!!deleteRoleId}
        onClose={() => setDeleteRoleId(null)}
        title="Delete Role"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        variant="danger"
      >
        <p>Delete this role? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
