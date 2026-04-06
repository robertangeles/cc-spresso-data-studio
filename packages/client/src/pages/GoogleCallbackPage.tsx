import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(`Google sign-in was cancelled or failed: ${errorParam}`);
      return;
    }

    if (!code) {
      setError('No authorization code received from Google.');
      return;
    }

    loginWithGoogle(code)
      .then(() => navigate('/content'))
      .catch((err) => {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Google sign-in failed. Please try again.';
        setError(msg);
      });
  }, [searchParams, loginWithGoogle, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0">
      {error ? (
        <div className="text-center space-y-4">
          <div className="rounded-lg border border-status-error/30 bg-status-error-dim px-4 py-3 text-sm text-status-error max-w-sm">
            {error}
          </div>
          <a
            href="/login"
            className="text-sm font-medium text-accent hover:text-accent-hover transition-colors"
          >
            Back to login
          </a>
        </div>
      ) : (
        <div className="text-center space-y-3">
          <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-text-secondary">Signing in with Google...</p>
        </div>
      )}
    </div>
  );
}
