import { useState, useRef, useEffect, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Coffee, Plus, MessageSquare, LayoutDashboard, Workflow, Zap, FileText, Settings, User, LogOut, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

const contentOpsItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/flows', label: 'Orchestrations', icon: Workflow },
  { to: '/skills', label: 'Skills', icon: Zap },
  { to: '/content', label: 'Content', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showMenu, setShowMenu] = useState(false);
  const [chatHistory, setChatHistory] = useState<Conversation[]>([]);
  const [chatExpanded, setChatExpanded] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  // Fetch avatar
  useEffect(() => {
    if (!user) return;
    api.get('/profile').then(({ data }) => {
      setAvatarUrl(data.data?.avatarUrl ?? null);
    }).catch(() => {});
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
      setChatHistory(data.data ?? []);
    } catch { /* non-blocking */ }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

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
    <aside className="flex w-56 flex-col border-r border-gray-100 bg-white">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-gray-100">
        <Coffee className="h-7 w-7 text-brand-600" />
        <span className="text-lg font-bold tracking-tight text-brand-700">Spresso</span>
      </div>

      {/* Chat zone */}
      <div className="px-3 pt-3">
        <div className="flex items-center justify-between mb-1">
          <button
            type="button"
            onClick={() => setChatExpanded(!chatExpanded)}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600"
          >
            {chatExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Chat
          </button>
          <button
            type="button"
            onClick={() => navigate('/chat')}
            className="flex items-center gap-1 rounded-md bg-brand-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-3 w-3" />
            New
          </button>
        </div>

        {chatExpanded && (
          <div className="max-h-48 overflow-y-auto space-y-0.5 mb-2">
            {chatHistory.length === 0 ? (
              <p className="px-2 py-2 text-[11px] text-gray-300">No chats yet. Start one.</p>
            ) : (
              chatHistory.slice(0, 15).map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center rounded-md px-2 py-1.5 text-[12px] cursor-pointer transition-colors ${
                    isOnChat && location.search.includes(c.id)
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-gray-600 hover:bg-gray-50'
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
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="px-4 py-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-300">Content Ops</p>
      </div>

      {/* Content ops zone */}
      <nav className="flex-1 space-y-0.5 px-3">
        {contentOpsItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User profile */}
      {user && (
        <div ref={menuRef} className="relative border-t border-gray-100 p-3">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-gray-50 transition-colors"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-gray-900">{user.name}</p>
              <p className="truncate text-[10px] text-gray-400">{user.email}</p>
            </div>
          </button>

          {showMenu && (
            <div className="absolute bottom-full left-3 right-3 mb-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-50">
              <NavLink
                to="/profile"
                onClick={() => setShowMenu(false)}
                className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50"
              >
                <User className="h-3.5 w-3.5" />
                Profile
              </NavLink>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-red-600 hover:bg-red-50"
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
