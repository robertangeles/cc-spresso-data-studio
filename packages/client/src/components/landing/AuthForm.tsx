import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { api } from '../../lib/api';

interface AuthFormProps {
  mode?: 'login' | 'register';
  onSuccess?: () => void;
  compact?: boolean;
}

export function AuthForm({ mode = 'login', onSuccess, compact = false }: AuthFormProps) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  // Fetch Turnstile site key on mount
  useEffect(() => {
    const fetchCaptchaConfig = async () => {
      try {
        const { data } = await api.get('/auth/captcha-config');
        if (data.data?.siteKey) {
          setTurnstileSiteKey(data.data.siteKey);
        }
      } catch {
        // Turnstile not configured — proceed without
      }
    };
    fetchCaptchaConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (mode === 'register') {
        await register(email, password, name, turnstileToken || undefined);
        onSuccess?.();
        navigate('/verify-email');
      } else {
        await login(email, password);
        onSuccess?.();
        navigate('/chat');
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || "That didn't work. Try again.");
      } else {
        setError("That didn't work. Try again.");
      }
      // Reset Turnstile on failure so user can retry
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError('');
    try {
      const { api } = await import('../../lib/api');
      const { data } = await api.get('/auth/google/url');
      window.location.href = data.data.url;
    } catch {
      setError('Google sign-in is not configured. Set it up in Settings > Authentication.');
      setIsGoogleLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-status-error/30 bg-status-error-dim px-3 py-2.5 text-sm text-status-error animate-slide-up">
            {error}
          </div>
        )}

        {mode === 'register' && (
          <Input
            label="Name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
            autoComplete="name"
          />
        )}

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />

        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? 'Create a password' : 'Enter your password'}
            required
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-[34px] text-text-tertiary hover:text-text-secondary transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {/* Turnstile CAPTCHA — only shown for registration when configured */}
        {mode === 'register' && turnstileSiteKey && (
          <div className="flex justify-center">
            <Turnstile
              ref={turnstileRef}
              siteKey={turnstileSiteKey}
              onSuccess={setTurnstileToken}
              onError={() => setTurnstileToken(null)}
              onExpire={() => setTurnstileToken(null)}
              options={{ theme: 'dark', size: 'flexible' }}
            />
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Brewing...' : mode === 'register' ? 'Create account' : 'Get in'}
        </Button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-4">
        <div className="h-px flex-1 bg-border-subtle" />
        <span className="text-xs text-text-tertiary">or</span>
        <div className="h-px flex-1 bg-border-subtle" />
      </div>

      {/* Google Sign-In */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={isGoogleLoading}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-border-subtle bg-surface-3 px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-4 hover:border-accent/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isGoogleLoading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77.01-.54z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        )}
        Continue with Google
      </button>

      {!compact && (
        <p className="mt-5 text-center text-sm text-text-tertiary">
          {mode === 'login' ? (
            <>
              No account?{' '}
              <Link
                to="/register"
                className="font-medium text-accent hover:text-accent-hover transition-colors"
              >
                Make one
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-medium text-accent hover:text-accent-hover transition-colors"
              >
                Sign in
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
