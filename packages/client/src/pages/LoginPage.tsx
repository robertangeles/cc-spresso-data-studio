import { useRef, useState } from 'react';
import { LandingNav } from '../components/landing/LandingNav';
import { HeroSection } from '../components/landing/HeroSection';
import { ProblemSection } from '../components/landing/ProblemSection';
import { ProductShowcase } from '../components/landing/ProductShowcase';
import { ComparisonSection } from '../components/landing/ComparisonSection';
import { AudienceFitSection } from '../components/landing/AudienceFitSection';
import { AICopilotShowcase } from '../components/landing/AICopilotShowcase';
import { CustomizationSection } from '../components/landing/CustomizationSection';
import { FounderStorySection } from '../components/landing/FounderStorySection';
import { PricingSection } from '../components/landing/PricingSection';
import { CTASection } from '../components/landing/CTASection';
import { AuthSlideOver } from '../components/landing/AuthSlideOver';
import { SpressoLogo } from '../components/landing/SpressoLogo';

export function LoginPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [selectedPlanId, setSelectedPlanId] = useState<string | undefined>();
  const howItWorksRef = useRef<HTMLDivElement>(null);

  const openAuth = (mode: 'login' | 'register', planId?: string) => {
    if (planId) setSelectedPlanId(planId);
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const scrollToHowItWorks = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative min-h-screen bg-surface-0 overflow-x-hidden">
      {/* Sticky nav */}
      <LandingNav onSignIn={() => openAuth('login')} onStartFree={() => openAuth('register')} />

      {/* Page sections */}
      <HeroSection
        onGetStarted={() => openAuth('register')}
        onScrollToHowItWorks={scrollToHowItWorks}
      />
      <ProblemSection />
      <div ref={howItWorksRef}>
        <ProductShowcase />
      </div>
      <ComparisonSection />
      <AudienceFitSection />
      <AICopilotShowcase />
      <CustomizationSection />
      <FounderStorySection />
      <PricingSection onGetStarted={(planId) => openAuth('register', planId)} />
      <CTASection onGetStarted={() => openAuth('register')} />

      {/* Footer */}
      <footer className="relative border-t border-border-subtle py-10 px-6">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SpressoLogo size="sm" />
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-accent">
              Open Beta
            </span>
          </div>
          <p className="text-xs text-text-tertiary">
            Turn one idea into platform-ready posts. &copy; {new Date().getFullYear()} Spresso.
          </p>
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
