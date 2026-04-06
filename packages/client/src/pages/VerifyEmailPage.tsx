import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, RefreshCw, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

const POLL_INTERVAL_MS = 3000;
const RESEND_COOLDOWN_S = 60;

export function VerifyEmailPage() {
  const { user, refreshVerificationStatus } = useAuth();
  const navigate = useNavigate();
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_S);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [verified, setVerified] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const maskedEmail = user?.email ? maskEmail(user.email) : 'your email';

  // Poll for verification status
  const pollStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/verification-status');
      if (data.data?.isEmailVerified) {
        setVerified(true);
        if (pollRef.current) clearInterval(pollRef.current);

        // Check for pending plan BEFORE refreshing auth context
        // (refreshing auth triggers useEffect that navigates to /chat)
        const pendingPlanId = data.data.pendingPlanId;
        if (pendingPlanId) {
          try {
            const { data: checkoutData } = await api.post('/billing/checkout', {
              planId: pendingPlanId,
            });
            if (checkoutData.success && checkoutData.data?.url) {
              window.location.href = checkoutData.data.url;
              return;
            }
          } catch (err) {
            console.error('[VerifyEmail] Checkout failed:', err);
            // Auth may have expired — user will need to login,
            // pendingPlanId stays in DB so checkout triggers after login
          }
        }

        // Try refreshing auth — if it fails, ProtectedRoute handles redirect
        try {
          await refreshVerificationStatus();
        } catch {
          // Auth expired — redirect to login
          navigate('/login', { replace: true });
          return;
        }
        setTimeout(() => navigate('/content', { replace: true }), 1500);
      }
    } catch {
      // Non-blocking — keep polling
    }
  }, [navigate, refreshVerificationStatus]);

  useEffect(() => {
    // If already verified, redirect immediately
    if (user?.isEmailVerified) {
      navigate('/content', { replace: true });
      return;
    }

    pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);

    // Pause polling when tab is hidden
    const handleVisibility = () => {
      if (document.hidden) {
        if (pollRef.current) clearInterval(pollRef.current);
      } else {
        pollStatus();
        pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, navigate, pollStatus]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setResendMessage('');

    try {
      await api.post('/auth/resend-verification');
      setResendMessage('Verification email sent! Check your inbox.');
      setResendCooldown(RESEND_COOLDOWN_S);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setResendMessage(axiosErr.response?.data?.error || 'Failed to resend. Try again later.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="relative rounded-2xl border border-border-subtle bg-surface-1/80 backdrop-blur-xl p-8 shadow-dark-lg overflow-hidden">
          {/* Ambient glow */}
          <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-accent/5 blur-3xl" />

          {verified ? (
            /* Celebration state */
            <div className="relative text-center animate-slide-up">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-status-success/10 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
                <CheckCircle2 className="h-8 w-8 text-status-success animate-scale-in" />
              </div>
              <h1 className="font-heading text-2xl font-semibold text-text-primary mb-2">
                Email verified!
              </h1>
              <p className="text-text-tertiary text-sm flex items-center justify-center gap-1.5">
                Taking you to your dashboard <ArrowRight className="h-4 w-4 animate-pulse" />
              </p>
            </div>
          ) : (
            /* Waiting state */
            <div className="relative">
              {/* Animated envelope */}
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20 shadow-[0_0_24px_rgba(255,214,10,0.12)]">
                <Mail className="h-10 w-10 text-accent animate-bounce-slow" />
              </div>

              <h1 className="font-heading text-2xl font-semibold text-text-primary text-center mb-2">
                Check your email
              </h1>
              <p className="text-text-tertiary text-sm text-center mb-6">
                We sent a verification link to{' '}
                <span className="text-text-secondary font-medium">{maskedEmail}</span>. Click the
                link to activate your account.
              </p>

              {/* Resend section */}
              <div className="space-y-3">
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || isResending}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-3 px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-4 hover:border-accent/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`h-4 w-4 ${isResending ? 'animate-spin' : ''}`} />
                  {isResending
                    ? 'Sending...'
                    : resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : 'Resend verification email'}
                </button>

                {resendMessage && (
                  <p
                    className={`text-xs text-center animate-slide-up ${
                      resendMessage.includes('sent') ? 'text-status-success' : 'text-status-error'
                    }`}
                  >
                    {resendMessage}
                  </p>
                )}
              </div>

              {/* Polling indicator */}
              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-text-tertiary">
                <div className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse" />
                Waiting for verification...
              </div>

              {/* Help text */}
              <p className="mt-4 text-xs text-text-tertiary text-center">
                Didn&apos;t get the email? Check your spam folder or try resending.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 5))}${local[local.length - 1]}@${domain}`;
}
