import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AdminRoute } from './components/auth/AdminRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProjectsListPage } from './pages/ProjectsListPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
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
import { AuthSettingsPage } from './pages/settings/AuthSettingsPage';
import { GoogleCallbackPage } from './pages/GoogleCallbackPage';
import { ContentLibraryPage } from './pages/ContentLibraryPage';
import { ContentBuilderPage } from './pages/ContentBuilderPage';
import { ChatPage } from './pages/ChatPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { VerifyTokenPage } from './pages/VerifyTokenPage';
import { UpgradeModal } from './components/common/UpgradeModal';
import { PlanSwitcherModal } from './components/billing/PlanSwitcherModal';
import { UpgradeCelebration } from './components/billing/UpgradeCelebration';
import { PricingPage } from './pages/PricingPage';
import { BillingPage } from './pages/settings/BillingPage';
import { EmailTemplatePage } from './pages/settings/EmailTemplatePage';
import { CommunityPage } from './pages/CommunityPage';
import { OrganisationPage } from './pages/OrganisationPage';
import { CommunitySettingsPage } from './pages/settings/CommunitySettingsPage';
import { PagesSettingsPage } from './pages/settings/PagesSettingsPage';
import { SubscriptionProvider } from './context/SubscriptionContext';
// ContentCalendarPage removed — calendar is now inline in Content Builder

import { useSubscription } from './context/SubscriptionContext';

/** Wrapper that connects PlanSwitcherModal to global SubscriptionContext state */
function GlobalPlanSwitcher() {
  const { planSwitcherOpen, closePlanSwitcher } = useSubscription();
  return <PlanSwitcherModal isOpen={planSwitcherOpen} onClose={closePlanSwitcher} />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SubscriptionProvider>
          <ToastProvider>
            <UpgradeModal />
            <UpgradeCelebration />
            <GlobalPlanSwitcher />
            <Routes>
              {/* Public routes — landing page at root */}
              <Route path="/" element={<LoginPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/verify/:token" element={<VerifyTokenPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />

              {/* Protected routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/projects" element={<ProjectsListPage />} />
                  <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                  <Route path="/flows" element={<WorkflowsPage />} />
                  <Route path="/flows/:id" element={<FlowBuilderPage />} />
                  <Route path="/skills" element={<SkillsCatalogPage />} />
                  <Route path="/skills/create" element={<SkillCreatorPage />} />
                  <Route path="/skills/:id/edit" element={<SkillCreatorPage />} />
                  <Route path="/content" element={<ContentBuilderPage />} />
                  <Route path="/content/library" element={<ContentLibraryPage />} />
                  <Route path="/community" element={<CommunityPage />} />
                  <Route path="/community/*" element={<CommunityPage />} />
                  <Route path="/organisation" element={<OrganisationPage />} />
                  <Route path="/content/calendar" element={<Navigate to="/content" replace />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route element={<AdminRoute />}>
                    <Route path="/settings" element={<SettingsLayout />}>
                      <Route index element={<Navigate to="billing" replace />} />
                      <Route path="billing" element={<BillingPage />} />
                      <Route path="integrations/database" element={<DatabaseSettingsPage />} />
                      <Route path="integrations/ai-models" element={<LLMSettingsPage />} />
                      <Route path="integrations/media" element={<MediaSettingsPage />} />
                      <Route
                        path="integrations/social-media"
                        element={<SocialMediaSettingsPage />}
                      />
                      <Route path="integrations/auth" element={<AuthSettingsPage />} />
                      <Route path="admin/roles" element={<RoleManagementPage />} />
                      <Route path="admin/site" element={<SiteSettingsPage />} />
                      <Route path="admin/usage" element={<UsageDashboardPage />} />
                      <Route path="admin/system-prompts" element={<SystemPromptsPage />} />
                      <Route path="admin/email-templates" element={<EmailTemplatePage />} />
                      <Route path="admin/community" element={<CommunitySettingsPage />} />
                      <Route path="admin/pages" element={<PagesSettingsPage />} />
                    </Route>
                  </Route>
                </Route>
              </Route>

              {/* Redirects */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ToastProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
