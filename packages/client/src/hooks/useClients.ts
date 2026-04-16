import { useState, useCallback } from 'react';
import type {
  Client,
  ClientWithDetails,
  CreateClientDTO,
  UpdateClientDTO,
  CreateClientContactDTO,
  UpdateClientContactDTO,
  CreateClientContractDTO,
  UpdateClientContractDTO,
} from '@cc/shared';
import { api } from '../lib/api';

interface UseClientsReturn {
  clients: Client[];
  selectedClient: ClientWithDetails | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  fetchClients: (orgId: string) => Promise<void>;
  createClient: (dto: CreateClientDTO & { organisationId: string }) => Promise<Client>;
  updateClient: (clientId: string, dto: UpdateClientDTO) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  selectClient: (clientId: string) => Promise<void>;
  clearSelectedClient: () => void;
  addContact: (clientId: string, dto: CreateClientContactDTO) => Promise<void>;
  updateContact: (
    clientId: string,
    contactId: string,
    dto: UpdateClientContactDTO,
  ) => Promise<void>;
  deleteContact: (clientId: string, contactId: string) => Promise<void>;
  addContract: (clientId: string, dto: CreateClientContractDTO) => Promise<void>;
  updateContract: (
    clientId: string,
    contractId: string,
    dto: UpdateClientContractDTO,
  ) => Promise<void>;
  deleteContract: (clientId: string, contractId: string) => Promise<void>;
}

export function useClients(): UseClientsReturn {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientWithDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async (orgId: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/clients', { params: { orgId } });
      setClients(data.data ?? []);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to load clients';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const createClient = useCallback(
    async (dto: CreateClientDTO & { organisationId: string }): Promise<Client> => {
      setError(null);
      const { data } = await api.post('/clients', dto).catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Failed to create client';
        throw new Error(msg);
      });
      const created: Client = data.data;
      setClients((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      return created;
    },
    [],
  );

  const updateClient = useCallback(async (clientId: string, dto: UpdateClientDTO) => {
    setError(null);
    const { data } = await api.put(`/clients/${clientId}`, dto).catch((err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to update client';
      throw new Error(msg);
    });
    const updated: Client = data.data;
    setClients((prev) =>
      prev
        .map((c) => (c.id === clientId ? updated : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setSelectedClient((prev) => (prev?.id === clientId ? { ...prev, ...updated } : prev));
  }, []);

  const deleteClient = useCallback(async (clientId: string) => {
    setError(null);
    await api.delete(`/clients/${clientId}`).catch((err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to delete client';
      throw new Error(msg);
    });
    setClients((prev) => prev.filter((c) => c.id !== clientId));
    setSelectedClient((prev) => (prev?.id === clientId ? null : prev));
  }, []);

  const selectClient = useCallback(async (clientId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/clients/${clientId}`);
      setSelectedClient(data.data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to load client details';
      setError(msg);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const clearSelectedClient = useCallback(() => {
    setSelectedClient(null);
  }, []);

  const refreshSelectedClient = useCallback(async (clientId: string) => {
    const { data } = await api.get(`/clients/${clientId}`);
    setSelectedClient(data.data);
  }, []);

  const addContact = useCallback(
    async (clientId: string, dto: CreateClientContactDTO) => {
      await api.post(`/clients/${clientId}/contacts`, dto).catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Failed to add contact';
        throw new Error(msg);
      });
      await refreshSelectedClient(clientId);
    },
    [refreshSelectedClient],
  );

  const updateContact = useCallback(
    async (clientId: string, contactId: string, dto: UpdateClientContactDTO) => {
      await api.put(`/clients/${clientId}/contacts/${contactId}`, dto).catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Failed to update contact';
        throw new Error(msg);
      });
      await refreshSelectedClient(clientId);
    },
    [refreshSelectedClient],
  );

  const deleteContact = useCallback(
    async (clientId: string, contactId: string) => {
      await api.delete(`/clients/${clientId}/contacts/${contactId}`).catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Failed to delete contact';
        throw new Error(msg);
      });
      // Optimistic: remove from selectedClient immediately
      setSelectedClient((prev) => {
        if (!prev || prev.id !== clientId) return prev;
        return { ...prev, contacts: prev.contacts.filter((c) => c.id !== contactId) };
      });
      await refreshSelectedClient(clientId);
    },
    [refreshSelectedClient],
  );

  const addContract = useCallback(
    async (clientId: string, dto: CreateClientContractDTO) => {
      await api.post(`/clients/${clientId}/contracts`, dto).catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Failed to add contract';
        throw new Error(msg);
      });
      await refreshSelectedClient(clientId);
    },
    [refreshSelectedClient],
  );

  const updateContract = useCallback(
    async (clientId: string, contractId: string, dto: UpdateClientContractDTO) => {
      await api.put(`/clients/${clientId}/contracts/${contractId}`, dto).catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Failed to update contract';
        throw new Error(msg);
      });
      await refreshSelectedClient(clientId);
    },
    [refreshSelectedClient],
  );

  const deleteContract = useCallback(
    async (clientId: string, contractId: string) => {
      await api.delete(`/clients/${clientId}/contracts/${contractId}`).catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Failed to delete contract';
        throw new Error(msg);
      });
      // Optimistic: remove from selectedClient immediately
      setSelectedClient((prev) => {
        if (!prev || prev.id !== clientId) return prev;
        return { ...prev, contracts: prev.contracts.filter((c) => c.id !== contractId) };
      });
      await refreshSelectedClient(clientId);
    },
    [refreshSelectedClient],
  );

  return {
    clients,
    selectedClient,
    loading,
    detailLoading,
    error,
    fetchClients,
    createClient,
    updateClient,
    deleteClient,
    selectClient,
    clearSelectedClient,
    addContact,
    updateContact,
    deleteContact,
    addContract,
    updateContract,
    deleteContract,
  };
}
