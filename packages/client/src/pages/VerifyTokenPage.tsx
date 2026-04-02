import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

export function VerifyTokenPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Invalid verification link.');
      return;
    }

    const verify = async () => {
      try {
        await api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`);
        setStatus('success');
        // Redirect to login after brief celebration
        setTimeout(() => navigate('/login', { replace: true }), 2500);
      } catch (err: unknown) {
        setStatus('error');
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setErrorMessage(
          axiosErr.response?.data?.error ||
            'Verification failed. The link may be expired or invalid.',
        );
      }
    };

    verify();
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border-subtle bg-surface-1/80 backdrop-blur-xl p-8 shadow-dark-lg text-center">
          {status === 'loading' && (
            <div className="animate-slide-up">
              <Loader2 className="h-12 w-12 text-accent animate-spin mx-auto mb-4" />
              <h1 className="font-heading text-xl font-semibold text-text-primary">
                Verifying your email...
              </h1>
            </div>
          )}

          {status === 'success' && (
            <div className="animate-slide-up">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-status-success/10 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
                <CheckCircle2 className="h-8 w-8 text-status-success" />
              </div>
              <h1 className="font-heading text-xl font-semibold text-text-primary mb-2">
                Email verified!
              </h1>
              <p className="text-text-tertiary text-sm">
                Your account is ready. Redirecting you to sign in...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="animate-slide-up">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-status-error/10">
                <XCircle className="h-8 w-8 text-status-error" />
              </div>
              <h1 className="font-heading text-xl font-semibold text-text-primary mb-2">
                Verification failed
              </h1>
              <p className="text-text-tertiary text-sm mb-4">{errorMessage}</p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-surface-0 hover:bg-accent-hover transition-colors"
              >
                Go to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
