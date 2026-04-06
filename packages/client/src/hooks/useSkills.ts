import { useState, useEffect, useCallback } from 'react';
import type { Skill } from '@cc/shared';
import { api } from '../lib/api';

// ── My Workshop skills ──

interface UseMySkillsOptions {
  category?: string;
  search?: string;
}

export function useMySkills(options: UseMySkillsOptions = {}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (options.category) params.set('category', options.category);
      if (options.search) params.set('search', options.search);

      const { data } = await api.get(`/skills/mine?${params.toString()}`);
      setSkills(data.data);
    } catch {
      setSkills([]);
    } finally {
      setIsLoading(false);
    }
  }, [options.category, options.search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { skills, isLoading, refresh };
}

// ── Community skills ──

interface UseCommunitySkillsOptions {
  category?: string;
  search?: string;
  sort?: 'popular' | 'newest';
  creatorId?: string;
}

interface CommunityResult {
  skills: Skill[];
  hasMore: boolean;
  nextCursor: string | null;
}

export function useCommunitySkills(options: UseCommunitySkillsOptions = {}) {
  const [result, setResult] = useState<CommunityResult>({
    skills: [],
    hasMore: false,
    nextCursor: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (options.category) params.set('category', options.category);
      if (options.search) params.set('search', options.search);
      if (options.sort) params.set('sort', options.sort);
      if (options.creatorId) params.set('creator', options.creatorId);

      const { data } = await api.get(`/skills/community?${params.toString()}`);
      setResult(data.data);
    } catch {
      setResult({ skills: [], hasMore: false, nextCursor: null });
    } finally {
      setIsLoading(false);
    }
  }, [options.category, options.search, options.sort, options.creatorId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...result, isLoading, refresh };
}

// ── Trending skills ──

export function useTrendingSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api
      .get('/skills/community/trending')
      .then(({ data }) => setSkills(data.data))
      .catch(() => setSkills([]))
      .finally(() => setIsLoading(false));
  }, []);

  return { skills, isLoading };
}

// ── Single skill ──

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

// ── Skill actions ──

export function useSkillActions() {
  const [isLoading, setIsLoading] = useState(false);

  const fork = useCallback(async (skillId: string) => {
    setIsLoading(true);
    try {
      const { data } = await api.post(`/skills/${skillId}/fork`);
      return data.data as Skill;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleFavorite = useCallback(async (skillId: string) => {
    const { data } = await api.post(`/skills/${skillId}/favorite`);
    return data.data as { favorited: boolean };
  }, []);

  const updateVisibility = useCallback(async (skillId: string, visibility: string) => {
    const { data } = await api.patch(`/skills/${skillId}/visibility`, { visibility });
    return data.data as Skill;
  }, []);

  return { fork, toggleFavorite, updateVisibility, isLoading };
}

// ── Legacy: backward compat for any existing useSkills consumers ──

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

      const { data } = await api.get(`/skills/mine?${params.toString()}`);
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
