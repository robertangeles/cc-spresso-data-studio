import type { LucideIcon } from 'lucide-react';
import { FolderKanban, Workflow, Zap, PenTool, Library, Users, Boxes } from 'lucide-react';

/**
 * The canonical list of sidebar nav items.
 *
 * Stable `key` is what gets persisted in the `sidebar-nav-config` setting —
 * never change or reuse a key after shipping, even if you rename the label.
 * Add a new key if the intent changes.
 *
 * When the saved config references a key that is no longer in this manifest,
 * the sidebar silently drops it. When the manifest gains a new key not yet in
 * the saved config, the admin decides whether to enable it (stays hidden until
 * they do).
 */
export interface NavItem {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_MANIFEST: NavItem[] = [
  { key: 'projects', to: '/projects', label: 'Projects', icon: FolderKanban },
  { key: 'skills', to: '/skills', label: 'Skills', icon: Zap },
  { key: 'flows', to: '/flows', label: 'Workflows', icon: Workflow },
  { key: 'content', to: '/content', label: 'Content Builder', icon: PenTool },
  { key: 'model-studio', to: '/model-studio', label: 'Model Studio', icon: Boxes },
  { key: 'content-library', to: '/content/library', label: 'Content Library', icon: Library },
  { key: 'community', to: '/community', label: 'The Brew', icon: Users },
];

export interface SavedNavItem {
  key: string;
  visible: boolean;
}

/**
 * Reconcile the admin-saved config against the current manifest.
 *
 * - Items in saved config AND in manifest → preserved in saved order, respect `visible`.
 * - Items in manifest NOT yet in saved config → returned separately as "unmanaged";
 *   they render nowhere in the sidebar until an admin enables them.
 * - Items in saved config NOT in manifest → silently dropped.
 */
export function resolveNav(saved: SavedNavItem[] | null): {
  resolved: Array<NavItem & { visible: boolean }>;
  unmanaged: NavItem[];
} {
  if (!saved) {
    // First boot / no admin has configured yet → everything visible in manifest order
    return {
      resolved: NAV_MANIFEST.map((i) => ({ ...i, visible: true })),
      unmanaged: [],
    };
  }

  const byKey = new Map(NAV_MANIFEST.map((i) => [i.key, i]));
  const savedKeys = new Set(saved.map((s) => s.key));

  const resolved: Array<NavItem & { visible: boolean }> = [];
  for (const s of saved) {
    const item = byKey.get(s.key);
    if (item) resolved.push({ ...item, visible: s.visible });
  }

  const unmanaged = NAV_MANIFEST.filter((i) => !savedKeys.has(i.key));
  return { resolved, unmanaged };
}
