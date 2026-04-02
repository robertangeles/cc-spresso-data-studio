import { NavLink, Outlet } from 'react-router-dom';

const settingsNav = [
  {
    category: 'Integrations',
    items: [
      { to: '/settings/integrations/database', label: 'Database' },
      { to: '/settings/integrations/ai-models', label: 'AI Models' },
      { to: '/settings/integrations/media', label: 'Media (Cloudinary)' },
      { to: '/settings/integrations/social-media', label: 'Social Media' },
      { to: '/settings/integrations/auth', label: 'Authentication' },
    ],
  },
  {
    category: 'Administration',
    items: [
      { to: '/settings/admin/roles', label: 'Users & Roles' },
      { to: '/settings/admin/site', label: 'Site Settings' },
      { to: '/settings/admin/usage', label: 'Usage & Costs' },
      { to: '/settings/admin/system-prompts', label: 'System Prompts' },
    ],
  },
];

export function SettingsLayout() {
  return (
    <div className="flex gap-6">
      <aside className="w-48 shrink-0">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Settings</h2>
        <nav className="space-y-4">
          {settingsNav.map((group) => (
            <div key={group.category}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-text-secondary">
                {group.category}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-accent-dim text-accent'
                          : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
