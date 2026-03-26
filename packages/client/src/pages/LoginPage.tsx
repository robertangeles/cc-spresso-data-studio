import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate('/chat');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || "That didn't work. Try again.");
      } else {
        setError("That didn't work. Try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-surface-0 px-4 overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Ambient aurora gradient */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,214,10,0.06)_0%,transparent_60%)]" />

      {/* Cursor-following glow */}
      <div
        className="pointer-events-none absolute h-[400px] w-[400px] rounded-full opacity-[0.03] transition-all duration-700 ease-out"
        style={{
          background: 'radial-gradient(circle, rgba(255,214,10,0.4) 0%, transparent 70%)',
          left: mousePos.x - 200,
          top: mousePos.y - 200,
        }}
      />

      <div className="relative z-10 w-full max-w-sm animate-slide-up">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-dim border border-accent/20 shadow-glow-accent">
            <img
              src="/logo.svg"
              alt="Spresso"
              className="h-8 w-8 text-accent"
              style={{
                filter:
                  'brightness(0) saturate(100%) invert(83%) sepia(60%) saturate(1000%) hue-rotate(5deg) brightness(104%) contrast(104%)',
              }}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Spresso</h1>
          <p className="mt-1 text-sm text-text-secondary font-medium">
            Create once. Reach everywhere.
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            Great content goes nowhere without distribution. Spresso handles both.
          </p>
        </div>

        {/* Login card with animated border */}
        <div className="relative rounded-2xl p-[1px] overflow-hidden">
          {/* Animated conic gradient border */}
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              background:
                'conic-gradient(from 0deg, transparent, rgba(255,214,10,0.15), transparent, rgba(255,214,10,0.08), transparent)',
              animation: 'spin 8s linear infinite',
            }}
          />
          <style>{`@keyframes spin { to { rotate: 360deg; } }`}</style>

          <div className="relative rounded-2xl bg-surface-2/90 backdrop-blur-glass p-6 border border-border-subtle">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-status-error/30 bg-status-error-dim px-3 py-2.5 text-sm text-status-error animate-slide-up">
                  {error}
                </div>
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

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Brewing...' : 'Get in'}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-text-tertiary">
              No account?{' '}
              <Link
                to="/register"
                className="font-medium text-accent hover:text-accent-hover transition-colors"
              >
                Make one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
