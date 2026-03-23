import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { MessageSquare, LayoutDashboard, Workflow, Zap, FileText, Settings, User, LogOut } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/flows', label: 'Orchestrations', icon: Workflow },
  { to: '/skills', label: 'Skills', icon: Zap },
  { to: '/content', label: 'Content', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  const handleLogout = async () => {
    setShowMenu(false);
    await logout();
    navigate('/login');
  };

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

  return (
    <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <item.icon className="h-4.5 w-4.5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User profile section */}
      {user && (
        <div ref={menuRef} className="relative border-t border-gray-200 p-4">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
              <p className="truncate text-xs text-gray-400">{user.email}</p>
              <p className="truncate text-[10px] text-gray-300 capitalize">{user.role}</p>
            </div>
          </button>

          {/* Click menu */}
          {showMenu && (
            <div className="absolute bottom-full left-4 right-4 mb-2 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-50">
              <NavLink
                to="/profile"
                onClick={() => setShowMenu(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <User className="h-4 w-4" />
                User Profile
              </NavLink>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
