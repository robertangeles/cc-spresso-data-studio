import { NavLink, Outlet } from 'react-router-dom';

const settingsNav = [
  {
    category: 'Integrations',
    items: [
      { to: '/settings/integrations/database', label: 'Database' },
      { to: '/settings/integrations/ai-models', label: 'AI Models' },
      { to: '/settings/integrations/media', label: 'Media (Cloudinary)' },
    ],
  },
  {
    category: 'Administration',
    items: [
      { to: '/settings/admin/roles', label: 'Users & Roles' },
      { to: '/settings/admin/site', label: 'Site Settings' },
      { to: '/settings/admin/usage', label: 'Usage & Costs' },
    ],
  },
];

export function SettingsLayout() {
  return (
    <div className="flex gap-6">
      <aside className="w-48 shrink-0">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Settings</h2>
        <nav className="space-y-4">
          {settingsNav.map((group) => (
            <div key={group.category}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-500">
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
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
