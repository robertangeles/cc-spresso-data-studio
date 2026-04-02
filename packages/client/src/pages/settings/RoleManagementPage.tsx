import { useState, useEffect, useCallback } from 'react';
import { useRoles } from '../../hooks/useRoles';
import { Modal } from '../../components/ui/Modal';
import type { CreateRoleDTO } from '@cc/shared';
import { api } from '../../lib/api';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  roleId: string | null;
  isBlocked: boolean;
  freeSessionsLimit: number;
  freeSessionsUsed: number;
  googleId: string | null;
  createdAt: string;
  roles: { id: string; name: string }[];
}

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

      {activeTab === 'users' && <UsersTab roles={roles} />}

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

// ─── Users Tab ───

function UsersTab({ roles }: { roles: { id: string; name: string }[] }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [blockUserId, setBlockUserId] = useState<string | null>(null);
  const [blockAction, setBlockAction] = useState<'block' | 'unblock'>('block');
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/users');
      setUsers(data.data ?? []);
    } catch {
      setError('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      // Update user fields
      await api.put(`/users/${editingUser.id}`, {
        name: editingUser.name,
        freeSessionsLimit: editingUser.freeSessionsLimit,
        freeSessionsUsed: editingUser.freeSessionsUsed,
      });
      // Update roles separately
      await api.put(`/users/${editingUser.id}/roles`, {
        roleIds: editingUser.roles.map((r) => r.id),
      });
      setEditingUser(null);
      await loadUsers();
    } catch {
      setError('Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleBlock = async () => {
    if (!blockUserId) return;
    try {
      await api.post(`/users/${blockUserId}/block`, { blocked: blockAction === 'block' });
      setBlockUserId(null);
      await loadUsers();
    } catch {
      setError('Failed to update user status');
    }
  };

  const handleDelete = async () => {
    if (!deleteUserId) return;
    try {
      await api.delete(`/users/${deleteUserId}`);
      setDeleteUserId(null);
      await loadUsers();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to delete user';
      setError(msg);
      setDeleteUserId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400 mb-4">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-200">
            Dismiss
          </button>
        </div>
      )}

      {/* Edit User Drawer */}
      {editingUser && (
        <div className="mb-6 rounded-lg border border-border-default bg-surface-3 p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            Edit User: {editingUser.email}
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
              <input
                type="text"
                value={editingUser.name}
                onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Roles</label>
              <div className="space-y-1.5 rounded-lg border border-border-default bg-surface-2 p-2 max-h-32 overflow-y-auto">
                {roles.map((r) => {
                  const isAssigned = editingUser.roles.some((ur) => ur.id === r.id);
                  return (
                    <label
                      key={r.id}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                        isAssigned ? 'bg-accent/10' : 'hover:bg-surface-3'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        onChange={() => {
                          const updatedRoles = isAssigned
                            ? editingUser.roles.filter((ur) => ur.id !== r.id)
                            : [...editingUser.roles, { id: r.id, name: r.name }];
                          setEditingUser({ ...editingUser, roles: updatedRoles });
                        }}
                        className="rounded border-border-default accent-accent"
                      />
                      <span
                        className={`text-sm ${isAssigned ? 'text-accent font-medium' : 'text-text-secondary'}`}
                      >
                        {r.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Free Sessions Limit
              </label>
              <input
                type="number"
                min={0}
                value={editingUser.freeSessionsLimit}
                onChange={(e) =>
                  setEditingUser({ ...editingUser, freeSessionsLimit: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Sessions Used
              </label>
              <input
                type="number"
                min={0}
                value={editingUser.freeSessionsUsed}
                onChange={(e) =>
                  setEditingUser({ ...editingUser, freeSessionsUsed: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveUser}
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setEditingUser(null)}
              className="rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-3"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="overflow-hidden rounded-lg border border-border-default">
        <table className="w-full text-sm">
          <thead className="bg-surface-3">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-text-secondary">User</th>
              <th className="px-4 py-3 text-left font-medium text-text-secondary">Role</th>
              <th className="px-4 py-3 text-left font-medium text-text-secondary">Status</th>
              <th className="px-4 py-3 text-left font-medium text-text-secondary">Sessions</th>
              <th className="px-4 py-3 text-left font-medium text-text-secondary">Auth</th>
              <th className="px-4 py-3 text-left font-medium text-text-secondary">Joined</th>
              <th className="px-4 py-3 text-right font-medium text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {users.map((user) => (
              <tr key={user.id} className="bg-surface-2 hover:bg-surface-3">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-text-primary">{user.name}</p>
                    <p className="text-xs text-text-tertiary">{user.email}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(user.roles?.length > 0 ? user.roles : [{ id: '', name: user.role }]).map(
                      (r) => (
                        <span
                          key={r.id || r.name}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.name === 'Administrator'
                              ? 'bg-amber-500/10 text-amber-400'
                              : r.name === 'Subscriber'
                                ? 'bg-surface-3 text-text-secondary'
                                : 'bg-accent/10 text-accent'
                          }`}
                        >
                          {r.name}
                        </span>
                      ),
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {user.isBlocked ? (
                    <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                      Blocked
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 h-1.5 rounded-full bg-surface-4 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          user.freeSessionsUsed >= user.freeSessionsLimit
                            ? 'bg-red-400'
                            : user.freeSessionsUsed >= user.freeSessionsLimit * 0.8
                              ? 'bg-amber-400'
                              : 'bg-green-400'
                        }`}
                        style={{
                          width: `${Math.min(100, (user.freeSessionsUsed / user.freeSessionsLimit) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-text-tertiary">
                      {user.freeSessionsUsed}/{user.freeSessionsLimit}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {user.googleId ? (
                    <span className="text-xs text-text-tertiary" title="Google OAuth">
                      <svg className="inline h-3.5 w-3.5" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77.01-.54z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                    </span>
                  ) : (
                    <span className="text-xs text-text-tertiary">Email</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-text-tertiary">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingUser(user)}
                      className="text-xs font-medium text-accent hover:text-accent-hover"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setBlockUserId(user.id);
                        setBlockAction(user.isBlocked ? 'unblock' : 'block');
                      }}
                      className={`text-xs font-medium ${
                        user.isBlocked
                          ? 'text-green-400 hover:text-green-300'
                          : 'text-amber-400 hover:text-amber-300'
                      }`}
                    >
                      {user.isBlocked ? 'Unblock' : 'Block'}
                    </button>
                    <button
                      onClick={() => setDeleteUserId(user.id)}
                      className="text-xs font-medium text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-tertiary">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Block confirmation */}
      <Modal
        isOpen={!!blockUserId}
        onClose={() => setBlockUserId(null)}
        title={blockAction === 'block' ? 'Block User' : 'Unblock User'}
        confirmLabel={blockAction === 'block' ? 'Block' : 'Unblock'}
        onConfirm={handleBlock}
        variant={blockAction === 'block' ? 'danger' : 'default'}
      >
        <p>
          {blockAction === 'block'
            ? 'This user will not be able to log in. Their data will be preserved.'
            : 'This user will be able to log in again.'}
        </p>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        isOpen={!!deleteUserId}
        onClose={() => setDeleteUserId(null)}
        title="Delete User"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        variant="danger"
      >
        <p>Permanently delete this user and all their data? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
