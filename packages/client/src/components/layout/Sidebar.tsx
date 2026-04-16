import { useState, useRef, useEffect, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Database,
  Plus,
  MessageSquare,
  FolderKanban,
  Workflow,
  Zap,
  PenTool,
  Library,
  Users,
  Settings,
  User,
  LogOut,
  Trash2,
  ChevronDown,
  ChevronRight,
  Building2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useOrganisation } from '../../hooks/useOrganisation';
import { CreditCounter } from '../CreditCounter';
import { CreditForecast } from '../billing/CreditForecast';
import { api } from '../../lib/api';

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

const contentOpsItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/skills', label: 'Skills', icon: Zap },
  { to: '/flows', label: 'Workflows', icon: Workflow },
  { to: '/content', label: 'Data Studio', icon: PenTool },
  { to: '/content/library', label: 'Content Library', icon: Library },
  { to: '/community', label: 'The Brew', icon: Users },
  { to: '/organisation', label: 'Organisation', icon: Building2 },
];

export function Sidebar() {
  const { user, logout, sessionStatus } = useAuth();
  const { plan, subscription, canUpgrade, canDowngrade, pendingDowngrade, openPlanSwitcher } =
    useSubscription();
  const { currentOrg } = useOrganisation();
  const navigate = useNavigate();
  const location = useLocation();
  const [showMenu, setShowMenu] = useState(false);
  const [chatHistory, setChatHistory] = useState<Conversation[]>([]);
  const [chatExpanded, setChatExpanded] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '??';

  // Fetch avatar
  useEffect(() => {
    if (!user) return;
    api
      .get('/profile')
      .then(({ data }) => {
        setAvatarUrl(data.data?.avatarUrl ?? null);
      })
      .catch(() => {});
  }, [user]);

  const handleLogout = async () => {
    setShowMenu(false);
    await logout();
    navigate('/login');
  };

  // Fetch chat history
  const fetchHistory = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/conversations');
      // Filter out Content Builder conversations — they use [CB] prefix
      const all = data.data ?? [];
      setChatHistory(all.filter((c: Conversation) => !c.title.startsWith('[CB]')));
    } catch {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Refresh history when navigating to chat
  useEffect(() => {
    if (location.pathname.startsWith('/chat')) fetchHistory();
  }, [location.pathname, fetchHistory]);

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const isOnChat = location.pathname.startsWith('/chat');

  return (
    <aside className="flex w-64 flex-col border-r border-border-subtle bg-surface-1">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border-subtle">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-dim">
          <Database className="h-5 w-5 text-accent" />
        </div>
        <span className="text-lg font-bold tracking-tight text-text-primary">Spresso</span>
        <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-accent">
          Open Beta
        </span>
      </div>

      {/* Chat zone */}
      <div className="px-3 pt-3">
        <div className="flex items-center justify-between mb-1">
          <button
            type="button"
            onClick={() => setChatExpanded(!chatExpanded)}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {chatExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Chat
          </button>
          <button
            type="button"
            onClick={() => navigate('/chat')}
            className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[10px] font-medium text-text-inverse hover:bg-accent-hover transition-all duration-200 ease-spring hover:shadow-glow-accent"
          >
            <Plus className="h-3 w-3" />
            New
          </button>
        </div>

        {chatExpanded && (
          <div className="max-h-48 overflow-y-auto space-y-0.5 mb-2">
            {chatHistory.length === 0 ? (
              <p className="px-2 py-2 text-[11px] text-text-tertiary">No chats yet. Start one.</p>
            ) : (
              chatHistory.slice(0, 15).map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center rounded-md px-2 py-1.5 text-[12px] cursor-pointer transition-all duration-200 ease-spring ${
                    isOnChat && location.search.includes(c.id)
                      ? 'bg-accent-dim text-accent border-l-2 border-accent'
                      : 'text-text-secondary hover:bg-surface-3 border-l-2 border-transparent'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/chat?id=${c.id}`)}
                    className="flex-1 flex items-center gap-1.5 text-left min-w-0"
                  >
                    <MessageSquare className="h-3 w-3 shrink-0 opacity-40" />
                    <span className="truncate">{c.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await api.delete(`/chat/conversations/${c.id}`);
                      fetchHistory();
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-text-tertiary hover:text-status-error transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Section label */}
      <div className="px-4 py-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          Content Ops
        </p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-0.5 px-3">
        {contentOpsItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200 ease-spring ${
                isActive
                  ? 'bg-accent-dim text-accent border-l-2 border-accent'
                  : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary border-l-2 border-transparent'
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              {item.label}
              {item.to === '/organisation' && currentOrg && (
                <span className="block truncate text-[10px] font-normal text-text-tertiary leading-tight">
                  {currentOrg.name}
                </span>
              )}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Session counter — visible only for metered (free) users */}
      {sessionStatus && !sessionStatus.unlimited && (
        <div className="mx-3 mb-2 rounded-lg border border-border-subtle bg-surface-2/50 backdrop-blur-glass p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                AI Sessions
              </span>
            </div>
            <span
              className={`text-[11px] font-bold tabular-nums ${
                sessionStatus.remaining <= 0
                  ? 'text-status-error'
                  : sessionStatus.remaining <= 2
                    ? 'text-amber-400'
                    : 'text-accent'
              }`}
            >
              {sessionStatus.remaining}/{sessionStatus.limit}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-spring ${
                sessionStatus.remaining <= 0
                  ? 'bg-status-error'
                  : sessionStatus.remaining <= 2
                    ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                    : sessionStatus.remaining <= Math.floor(sessionStatus.limit * 0.5)
                      ? 'bg-gradient-to-r from-accent to-amber-500'
                      : 'bg-gradient-to-r from-emerald-500 to-accent'
              }`}
              style={{
                width: `${Math.max(0, (sessionStatus.remaining / sessionStatus.limit) * 100)}%`,
              }}
            />
          </div>
          {sessionStatus.remaining <= 2 && sessionStatus.remaining > 0 && (
            <p className="mt-1.5 text-[10px] text-amber-400/80">
              {sessionStatus.remaining} session{sessionStatus.remaining !== 1 ? 's' : ''} remaining
            </p>
          )}
          {sessionStatus.remaining <= 0 && (
            <p className="mt-1.5 text-[10px] text-status-error/80">
              Sessions exhausted — upgrade to continue
            </p>
          )}
        </div>
      )}

      {/* Legal links */}
      <div className="mx-3 mb-1 flex gap-3">
        <NavLink
          to="/privacy"
          className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
        >
          Privacy
        </NavLink>
        <NavLink
          to="/terms"
          className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
        >
          Terms
        </NavLink>
      </div>

      {/* User profile */}
      {user && (
        <div ref={menuRef} className="relative border-t border-border-subtle p-3">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-3 transition-all duration-200"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-dim text-xs font-semibold text-accent">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-text-primary">{user.name}</p>
              <p className="truncate text-[10px] text-text-tertiary">{user.email}</p>
              {/* Plan badge with upgrade CTA */}
              {user.role === 'Administrator' ? (
                <p className="truncate text-[10px] text-text-tertiary">Administrator</p>
              ) : user.role === 'Paid Subscriber' ? (
                canUpgrade ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPlanSwitcher();
                    }}
                    className="flex items-center gap-1.5 group/upgrade"
                  >
                    <span className="text-[10px] font-semibold text-accent">
                      {plan?.displayName ??
                        (user.subscriptionTier === 'business' ? 'Business' : 'Creator')}
                    </span>
                    <span className="text-[10px] font-medium text-accent/60 group-hover/upgrade:text-accent transition-colors">
                      Upgrade →
                    </span>
                  </button>
                ) : pendingDowngrade ? (
                  <p className="text-[10px] font-semibold text-accent truncate">
                    {plan?.displayName ?? 'Business'}{' '}
                    <span className="font-normal text-amber-400/80">
                      → {pendingDowngrade.planName}{' '}
                      {new Date(pendingDowngrade.effectiveDate).toLocaleDateString()}
                    </span>
                  </p>
                ) : canDowngrade ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPlanSwitcher();
                    }}
                    className="flex items-center gap-1.5 group/upgrade"
                  >
                    <span className="text-[10px] font-semibold text-accent">
                      {plan?.displayName ?? 'Business'}
                    </span>
                    <span className="text-[10px] font-medium text-text-tertiary group-hover/upgrade:text-accent transition-colors">
                      Downgrade →
                    </span>
                  </button>
                ) : (
                  <p className="text-[10px] font-semibold text-accent">
                    {plan?.displayName ?? 'Business'}
                  </p>
                )
              ) : (
                <p className="truncate text-[10px] text-text-tertiary">Subscriber</p>
              )}
              <CreditCounter />
              <CreditForecast />
              {/* Low-credit nudge: show when credits < 20% */}
              {subscription &&
                subscription.creditsAllocated > 0 &&
                subscription.creditsRemaining / subscription.creditsAllocated < 0.2 &&
                canUpgrade && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPlanSwitcher();
                    }}
                    className="mt-1 w-full rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-[9px] text-amber-400 hover:bg-amber-500/15 transition-all"
                  >
                    Running low? Upgrade for more credits →
                  </button>
                )}
            </div>
          </button>

          {showMenu && (
            <div className="absolute bottom-full left-3 right-3 mb-1 rounded-lg border border-border-default bg-surface-2 py-1 shadow-dark-lg backdrop-blur-glass z-50 animate-scale-in">
              <NavLink
                to="/profile"
                onClick={() => setShowMenu(false)}
                className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-3 transition-colors"
              >
                <User className="h-3.5 w-3.5" />
                Profile
              </NavLink>
              {user.role === 'Administrator' && (
                <NavLink
                  to="/settings"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-3 transition-colors"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Admin Settings
                </NavLink>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-status-error hover:bg-status-error-dim transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
