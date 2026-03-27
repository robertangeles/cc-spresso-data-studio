import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { FlowBuilderPage } from './pages/FlowBuilderPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SkillsCatalogPage } from './pages/SkillsCatalogPage';
import { SkillCreatorPage } from './pages/settings/SkillCreatorPage';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { DatabaseSettingsPage } from './pages/settings/DatabaseSettingsPage';
import { LLMSettingsPage } from './pages/settings/LLMSettingsPage';
import { RoleManagementPage } from './pages/settings/RoleManagementPage';
import { ProfilePage } from './pages/settings/ProfilePage';
import { MediaSettingsPage } from './pages/settings/MediaSettingsPage';
import { SiteSettingsPage } from './pages/settings/SiteSettingsPage';
import UsageDashboardPage from './pages/settings/UsageDashboardPage';
import { SystemPromptsPage } from './pages/settings/SystemPromptsPage';
import { SocialMediaSettingsPage } from './pages/settings/SocialMediaSettingsPage';
import { ContentLibraryPage } from './pages/ContentLibraryPage';
import { ContentBuilderPage } from './pages/ContentBuilderPage';
import { ChatPage } from './pages/ChatPage';
import { ContentCalendarPage } from './pages/ContentCalendarPage';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/flows" element={<DashboardPage />} />
                <Route path="/flows/:id" element={<FlowBuilderPage />} />
                <Route path="/skills" element={<SkillsCatalogPage />} />
                <Route path="/skills/create" element={<SkillCreatorPage />} />
                <Route path="/skills/:id/edit" element={<SkillCreatorPage />} />
                <Route path="/content" element={<ContentBuilderPage />} />
                <Route path="/content/library" element={<ContentLibraryPage />} />
                <Route path="/content/calendar" element={<ContentCalendarPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SettingsLayout />}>
                  <Route index element={<Navigate to="integrations/database" replace />} />
                  <Route path="integrations/database" element={<DatabaseSettingsPage />} />
                  <Route path="integrations/ai-models" element={<LLMSettingsPage />} />
                  <Route path="integrations/media" element={<MediaSettingsPage />} />
                  <Route path="integrations/social-media" element={<SocialMediaSettingsPage />} />
                  <Route path="admin/roles" element={<RoleManagementPage />} />
                  <Route path="admin/site" element={<SiteSettingsPage />} />
                  <Route path="admin/usage" element={<UsageDashboardPage />} />
                  <Route path="admin/system-prompts" element={<SystemPromptsPage />} />
                </Route>
              </Route>
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
