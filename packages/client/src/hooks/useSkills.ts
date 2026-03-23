import { useState, useEffect, useCallback } from 'react';
import type { Skill } from '@cc/shared';
import { api } from '../lib/api';

interface UseSkillsOptions {
  category?: string;
  source?: string;
  search?: string;
}

export function useSkills(options: UseSkillsOptions = {}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (options.category) params.set('category', options.category);
      if (options.source) params.set('source', options.source);
      if (options.search) params.set('search', options.search);

      const { data } = await api.get(`/skills?${params.toString()}`);
      setSkills(data.data);
    } catch {
      setSkills([]);
    } finally {
      setIsLoading(false);
    }
  }, [options.category, options.source, options.search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { skills, isLoading, refresh };
}

export function useSkill(idOrSlug: string | undefined) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!idOrSlug) {
      setSkill(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    api
      .get(`/skills/${idOrSlug}`)
      .then(({ data }) => setSkill(data.data))
      .catch(() => setSkill(null))
      .finally(() => setIsLoading(false));
  }, [idOrSlug]);

  return { skill, isLoading };
}
