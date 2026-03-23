import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { UserProfile, UserRule, UpdateProfileDTO, CreateRuleDTO, UpdateRuleDTO } from '@cc/shared';

// --- Profile ---

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/profile');
      setProfile(data.data);
    } catch {
      // Profile auto-creates, so this shouldn't fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const updateProfile = async (updates: UpdateProfileDTO) => {
    const { data } = await api.put('/profile', updates);
    setProfile(data.data);
    return data.data as UserProfile;
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api.put('/profile/password', { currentPassword, newPassword });
  };

  return { profile, isLoading, refresh, updateProfile, changePassword };
}

// --- Rules ---

export function useRules() {
  const [rules, setRules] = useState<UserRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/profile/rules');
      setRules(data.data);
    } catch {
      // Non-blocking
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createRule = async (dto: CreateRuleDTO) => {
    const { data } = await api.post('/profile/rules', dto);
    await refresh();
    return data.data as UserRule;
  };

  const updateRule = async (id: string, dto: UpdateRuleDTO) => {
    const { data } = await api.put(`/profile/rules/${id}`, dto);
    await refresh();
    return data.data as UserRule;
  };

  const deleteRule = async (id: string) => {
    await api.delete(`/profile/rules/${id}`);
    await refresh();
  };

  return { rules, isLoading, refresh, createRule, updateRule, deleteRule };
}
