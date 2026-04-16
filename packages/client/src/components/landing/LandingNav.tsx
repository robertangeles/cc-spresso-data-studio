import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DataStudioLogo } from './DataStudioLogo';

interface LandingNavProps {
  onSignIn: () => void;
  onStartFree: () => void;
}

export function LandingNav({ onSignIn, onStartFree }: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-surface-0/80 backdrop-blur-xl border-b border-border-subtle shadow-dark-md'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
        <DataStudioLogo size="lg" />

        {/* Nav links + CTAs */}
        <div className="flex items-center gap-3">
          <Link
            to="/privacy"
            className="hidden sm:block px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Privacy
          </Link>
          <Link
            to="/terms"
            className="hidden sm:block px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Terms
          </Link>
          <button
            onClick={onSignIn}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors rounded-lg hover:bg-surface-2/50"
          >
            Sign in
          </button>
          <button
            onClick={onStartFree}
            className="relative px-5 py-2.5 text-sm font-semibold text-text-inverse bg-gradient-to-r from-accent to-amber-500 rounded-lg hover:from-accent-hover hover:to-amber-400 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow-strong animate-glow-pulse"
          >
            Start Free
          </button>
        </div>
      </div>
    </nav>
  );
}
