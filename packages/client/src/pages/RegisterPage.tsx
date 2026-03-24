import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Coffee } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await register(email, password, name);
      navigate('/chat');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || 'That didn\'t work. Try again.');
      } else {
        setError('That didn\'t work. Try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-yellow shadow-lg">
            <Coffee className="h-7 w-7 text-brand-700" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Spresso</h1>
          <p className="mt-1 text-sm text-brand-200">Drop an idea. Walk away with content.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <Input
              label="Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              autoComplete="name"
            />

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />

            <div>
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Make it strong"
                required
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-gray-400">Min 8 characters, uppercase, lowercase, number</p>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Brewing your account...' : 'Start brewing'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-gray-500">
            Already in?{' '}
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-500">
              Get back in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
