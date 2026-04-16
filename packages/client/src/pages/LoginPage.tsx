import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingNav } from '../components/landing/LandingNav';
import { HeroSection } from '../components/landing/HeroSection';
import { ProblemSection } from '../components/landing/ProblemSection';
import { AuthSlideOver } from '../components/landing/AuthSlideOver';
import { DataStudioLogo } from '../components/landing/DataStudioLogo';

export function LoginPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [selectedPlanId, setSelectedPlanId] = useState<string | undefined>();

  const openAuth = (mode: 'login' | 'register', planId?: string) => {
    if (planId) setSelectedPlanId(planId);
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <div className="relative min-h-screen bg-surface-0 overflow-x-hidden">
      {/* Sticky nav */}
      <LandingNav onSignIn={() => openAuth('login')} onStartFree={() => openAuth('register')} />

      {/* Page sections */}
      <HeroSection onGetStarted={() => openAuth('register')} />
      <ProblemSection />

      {/* Footer */}
      <footer className="relative border-t border-border-subtle py-10 px-6">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <DataStudioLogo size="sm" />
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-accent">
              Open Beta
            </span>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-xs text-text-tertiary">
              &copy; {new Date().getFullYear()} Spresso Data Studio.
            </p>
            <Link
              to="/privacy"
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Terms
            </Link>
          </div>
        </div>
      </footer>

      {/* Auth slide-over */}
      <AuthSlideOver
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        initialMode={authMode}
        planId={selectedPlanId}
      />
    </div>
  );
}
