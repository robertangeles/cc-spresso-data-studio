import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type {
  Organisation,
  OrganisationWithMembers,
  CreateOrganisationDTO,
  OrgRole,
} from '@cc/shared';

const STORAGE_KEY = 'spresso_current_org_id';

interface UseOrganisationReturn {
  organisations: Organisation[];
  currentOrg: Organisation | null;
  orgDetail: OrganisationWithMembers | null;
  loading: boolean;
  error: string | null;
  createOrg: (dto: CreateOrganisationDTO) => Promise<void>;
  updateOrg: (dto: { name?: string; description?: string }) => Promise<void>;
  deleteOrg: () => Promise<void>;
  joinOrg: (joinKey: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  updateMemberRole: (userId: string, role: OrgRole) => Promise<void>;
  regenerateKey: () => Promise<void>;
  switchOrg: (orgId: string) => void;
  refetch: () => Promise<void>;
}

export function useOrganisation(): UseOrganisationReturn {
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organisation | null>(null);
  const [orgDetail, setOrgDetail] = useState<OrganisationWithMembers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrgs = useCallback(async () => {
    try {
      setError(null);
      const { data } = await api.get('/organisations');
      const orgs: Organisation[] = data.data ?? [];
      setOrganisations(orgs);

      // Restore persisted selection or pick first
      const savedId = localStorage.getItem(STORAGE_KEY);
      const match = orgs.find((o) => o.id === savedId) ?? orgs[0] ?? null;
      setCurrentOrg(match);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load organisations';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch org detail whenever currentOrg changes
  useEffect(() => {
    if (!currentOrg) {
      setOrgDetail(null);
      return;
    }
    api
      .get(`/organisations/${currentOrg.id}`)
      .then(({ data }) => setOrgDetail(data.data ?? null))
      .catch(() => setOrgDetail(null));
  }, [currentOrg]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const switchOrg = useCallback(
    (orgId: string) => {
      const org = organisations.find((o) => o.id === orgId) ?? null;
      setCurrentOrg(org);
      if (org) localStorage.setItem(STORAGE_KEY, org.id);
    },
    [organisations],
  );

  const createOrg = useCallback(async (dto: CreateOrganisationDTO) => {
    setError(null);
    const { data } = await api.post('/organisations', dto).catch((err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to create organisation';
      throw new Error(msg);
    });
    const created: Organisation = data.data;
    setOrganisations((prev) => [...prev, created]);
    setCurrentOrg(created);
    localStorage.setItem(STORAGE_KEY, created.id);
  }, []);

  const updateOrg = useCallback(
    async (dto: { name?: string; description?: string }) => {
      if (!currentOrg) return;
      setError(null);
      const { data } = await api
        .put(`/organisations/${currentOrg.id}`, dto)
        .catch((err: unknown) => {
          const msg =
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            'Failed to update organisation';
          throw new Error(msg);
        });
      const updated: Organisation = data.data;
      setOrganisations((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setCurrentOrg(updated);
      setOrgDetail((prev) => (prev ? { ...prev, ...updated } : prev));
    },
    [currentOrg],
  );

  const deleteOrg = useCallback(async () => {
    if (!currentOrg) return;
    setError(null);
    await api.delete(`/organisations/${currentOrg.id}`).catch((err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to delete organisation';
      throw new Error(msg);
    });
    const remaining = organisations.filter((o) => o.id !== currentOrg.id);
    setOrganisations(remaining);
    const next = remaining[0] ?? null;
    setCurrentOrg(next);
    if (next) localStorage.setItem(STORAGE_KEY, next.id);
    else localStorage.removeItem(STORAGE_KEY);
  }, [currentOrg, organisations]);

  const joinOrg = useCallback(async (joinKey: string) => {
    setError(null);
    const { data } = await api.post('/organisations/join', { joinKey }).catch((err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Invalid join key';
      throw new Error(msg);
    });
    const joined: Organisation = data.data;
    setOrganisations((prev) => {
      const exists = prev.some((o) => o.id === joined.id);
      return exists ? prev : [...prev, joined];
    });
    setCurrentOrg(joined);
    localStorage.setItem(STORAGE_KEY, joined.id);
  }, []);

  const removeMember = useCallback(
    async (userId: string) => {
      if (!currentOrg) return;
      // Optimistic update
      setOrgDetail((prev) =>
        prev ? { ...prev, members: prev.members.filter((m) => m.userId !== userId) } : prev,
      );
      await api
        .delete(`/organisations/${currentOrg.id}/members/${userId}`)
        .catch((err: unknown) => {
          // Revert on failure — trigger refetch
          api
            .get(`/organisations/${currentOrg.id}`)
            .then(({ data }) => setOrgDetail(data.data ?? null));
          const msg =
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            'Failed to remove member';
          throw new Error(msg);
        });
    },
    [currentOrg],
  );

  const updateMemberRole = useCallback(
    async (userId: string, role: OrgRole) => {
      if (!currentOrg) return;
      // Optimistic update
      setOrgDetail((prev) =>
        prev
          ? {
              ...prev,
              members: prev.members.map((m) => (m.userId === userId ? { ...m, role } : m)),
            }
          : prev,
      );
      await api
        .put(`/organisations/${currentOrg.id}/members/${userId}`, { role })
        .catch((err: unknown) => {
          api
            .get(`/organisations/${currentOrg.id}`)
            .then(({ data }) => setOrgDetail(data.data ?? null));
          const msg =
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            'Failed to update role';
          throw new Error(msg);
        });
    },
    [currentOrg],
  );

  const regenerateKey = useCallback(async () => {
    if (!currentOrg) return;
    const { data } = await api
      .post(`/organisations/${currentOrg.id}/regenerate-key`)
      .catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Failed to regenerate key';
        throw new Error(msg);
      });
    const updated: Organisation = data.data;
    setCurrentOrg((prev) => (prev ? { ...prev, joinKey: updated.joinKey } : prev));
    setOrgDetail((prev) => (prev ? { ...prev, joinKey: updated.joinKey } : prev));
    setOrganisations((prev) =>
      prev.map((o) => (o.id === updated.id ? { ...o, joinKey: updated.joinKey } : o)),
    );
  }, [currentOrg]);

  return {
    organisations,
    currentOrg,
    orgDetail,
    loading,
    error,
    createOrg,
    updateOrg,
    deleteOrg,
    joinOrg,
    removeMember,
    updateMemberRole,
    regenerateKey,
    switchOrg,
    refetch: fetchOrgs,
  };
}
