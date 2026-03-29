import { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

// ─── Pulsing Grid Background ───
function PulsingGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const spacing = 32;
    const dotBase = 1.2;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const t = Date.now() * 0.001;
      const cx = canvas.width / 2;
      const cy = canvas.height * 0.38; // center near the logo

      const cols = Math.ceil(canvas.width / spacing) + 1;
      const rows = Math.ceil(canvas.height / spacing) + 1;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * spacing;
          const y = row * spacing;

          // Distance from center
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Concentric wave pulse — multiple rings radiating outward
          const wave1 = Math.sin(dist * 0.02 - t * 2.5) * 0.5 + 0.5;
          const wave2 = Math.sin(dist * 0.015 - t * 1.8 + 1.5) * 0.5 + 0.5;
          const wave = wave1 * 0.7 + wave2 * 0.3;

          // Fade out at edges
          const maxDist = Math.sqrt(cx * cx + cy * cy);
          const edgeFade = 1 - Math.min(dist / maxDist, 1);

          const alpha = wave * edgeFade * 0.4;
          const radius = dotBase + wave * edgeFade * 1.8;

          // Dot glow
          if (alpha > 0.05) {
            ctx.beginPath();
            ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 214, 10, ${alpha * 0.15})`;
            ctx.fill();
          }

          // Dot core
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 214, 10, ${0.08 + alpha * 0.5})`;
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.7 }}
    />
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

      {/* Pulsing grid animation */}
      <PulsingGrid />

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

              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
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
