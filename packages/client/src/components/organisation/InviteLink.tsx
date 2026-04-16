import { useState } from 'react';
import { Key, Copy, Check, RefreshCw, AlertTriangle } from 'lucide-react';

interface InviteLinkProps {
  joinKey: string;
  canManage: boolean;
  onRegenerate: () => Promise<void>;
}

export function InviteLink({ joinKey, canManage, onRegenerate }: InviteLinkProps) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(joinKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard');
    }
  };

  const handleRegenerateConfirm = async () => {
    setConfirming(false);
    setRegenerating(true);
    setError(null);
    try {
      await onRegenerate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate key');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="rounded-xl bg-surface-1/80 backdrop-blur-sm border border-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
          <Key className="h-4 w-4 text-accent" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">Invite Key</p>
          <p className="text-xs text-text-tertiary">Share this key with your team members</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 font-mono text-sm text-accent tracking-widest select-all overflow-x-auto">
          {joinKey}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy key"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-2/50 text-text-secondary hover:text-accent hover:border-accent/40 transition-all duration-200"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      {copied && <p className="text-xs text-emerald-400">Copied to clipboard!</p>}

      {error && (
        <p className="flex items-center gap-1 text-xs text-status-error">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </p>
      )}

      {canManage && (
        <div className="flex items-center gap-2 flex-wrap">
          {confirming ? (
            <>
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                This will invalidate the old key. Continue?
              </span>
              <button
                type="button"
                onClick={handleRegenerateConfirm}
                disabled={regenerating}
                className="rounded-lg bg-gradient-to-r from-accent to-amber-600 px-3 py-1 text-xs font-medium text-surface-0 hover:shadow-[0_0_12px_rgba(255,214,10,0.25)] transition-all disabled:opacity-50"
              >
                Yes, regenerate
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg bg-surface-3/50 px-3 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-all"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={regenerating}
              className="flex items-center gap-1.5 rounded-lg bg-surface-3/50 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${regenerating ? 'animate-spin' : ''}`} />
              Regenerate Key
            </button>
          )}
        </div>
      )}
    </div>
  );
}
