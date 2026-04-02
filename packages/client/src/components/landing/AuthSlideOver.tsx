import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { AuthForm } from './AuthForm';
import { SpressoLogo } from './SpressoLogo';

interface AuthSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

export function AuthSlideOver({ isOpen, onClose, initialMode = 'login' }: AuthSlideOverProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  if (!isOpen && !isClosing) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 drawer-overlay ${isClosing ? 'opacity-0 transition-opacity duration-200' : ''}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`absolute top-0 right-0 bottom-0 w-full max-w-md ${
          isClosing ? 'animate-drawer-out' : 'animate-drawer-in'
        }`}
      >
        <div className="h-full bg-surface-1/95 backdrop-blur-xl border-l border-border-subtle flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <SpressoLogo size="md" />
            <button
              onClick={handleClose}
              className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Mode tabs */}
          <div className="px-6 pt-4 pb-2">
            <div className="flex gap-1 p-1 rounded-lg bg-surface-2 border border-border-subtle">
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                    mode === m
                      ? 'bg-surface-4 text-text-primary shadow-dark-sm'
                      : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  {m === 'login' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mb-6">
              <h2 className="font-heading text-xl font-semibold text-text-primary">
                {mode === 'login' ? 'Welcome back' : 'Start creating'}
              </h2>
              <p className="mt-1 text-sm text-text-tertiary">
                {mode === 'login'
                  ? 'Sign in to your content studio'
                  : "Create your account — it's free during beta"}
              </p>
            </div>
            <AuthForm mode={mode} onSuccess={handleClose} compact />
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border-subtle">
            <p className="text-xs text-text-tertiary text-center">
              {mode === 'login' ? (
                <>
                  Don&apos;t have an account?{' '}
                  <button
                    onClick={() => setMode('register')}
                    className="text-accent hover:text-accent-hover transition-colors font-medium"
                  >
                    Create one free
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={() => setMode('login')}
                    className="text-accent hover:text-accent-hover transition-colors font-medium"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
