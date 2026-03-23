import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { Role, CreateRoleDTO, UpdateRoleDTO } from '@cc/shared';

export function useRoles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data } = await api.get('/roles');
      setRoles(data.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load roles';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createRole = async (dto: CreateRoleDTO) => {
    const { data } = await api.post('/roles', dto);
    await refresh();
    return data.data as Role;
  };

  const updateRole = async (id: string, dto: UpdateRoleDTO) => {
    const { data } = await api.put(`/roles/${id}`, dto);
    await refresh();
    return data.data as Role;
  };

  const deleteRole = async (id: string) => {
    await api.delete(`/roles/${id}`);
    await refresh();
  };

  return { roles, isLoading, error, refresh, createRole, updateRole, deleteRole };
}
