import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { NAV_MANIFEST, resolveNav, type NavItem, type SavedNavItem } from '../config/navManifest';

const NAV_UPDATED_EVENT = 'cc:nav-config-updated';

interface NavUpdatedDetail {
  items: SavedNavItem[] | null;
}

interface UseSidebarConfigReturn {
  /** Items in saved order, each carrying its visibility flag. */
  resolved: Array<NavItem & { visible: boolean }>;
  /** Items added to the manifest since the admin last saved — stay hidden until admin enables. */
  unmanaged: NavItem[];
  /** Raw saved array (null if the admin has never saved yet). */
  saved: SavedNavItem[] | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  /** Admin-only. Persists a new order/visibility. */
  save: (items: SavedNavItem[]) => Promise<void>;
}

export function useSidebarConfig(): UseSidebarConfigReturn {
  const [saved, setSaved] = useState<SavedNavItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/navigation-config');
      const items = data.data?.items ?? null;
      setSaved(items);
      // Broadcast so other hook instances (e.g. Sidebar) update too
      window.dispatchEvent(
        new CustomEvent<NavUpdatedDetail>(NAV_UPDATED_EVENT, { detail: { items } }),
      );
    } catch {
      setSaved(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Cross-instance sync: when one hook saves, others update without refetching.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NavUpdatedDetail>).detail;
      setSaved(detail?.items ?? null);
    };
    window.addEventListener(NAV_UPDATED_EVENT, handler);
    return () => window.removeEventListener(NAV_UPDATED_EVENT, handler);
  }, []);

  const save = useCallback(async (items: SavedNavItem[]) => {
    const { data } = await api.put('/navigation-config', { items });
    const next: SavedNavItem[] | null = data.data?.items ?? null;
    setSaved(next);
    window.dispatchEvent(
      new CustomEvent<NavUpdatedDetail>(NAV_UPDATED_EVENT, { detail: { items: next } }),
    );
  }, []);

  const { resolved, unmanaged } = resolveNav(saved);

  return { resolved, unmanaged, saved, isLoading, refresh, save };
}

// Re-export manifest for pages that need the canonical list
export { NAV_MANIFEST };
