import { useState, useRef, useEffect } from 'react';
import { X, Key, UserPlus, AlertTriangle } from 'lucide-react';

interface JoinOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (joinKey: string) => Promise<void>;
}

export function JoinOrgModal({ isOpen, onClose, onJoin }: JoinOrgModalProps) {
  const [joinKey, setJoinKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setJoinKey('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = joinKey.trim();
    if (!key) {
      setError('Please enter a join key');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onJoin(key);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid join key');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-surface-1/95 backdrop-blur-md border border-white/10 shadow-dark-lg animate-scale-in p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 shadow-[0_0_12px_rgba(255,214,10,0.15)]">
              <UserPlus className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">Join Organisation</h2>
              <p className="text-xs text-text-tertiary">Enter the invite key you received</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="join-key"
              className="block text-xs font-medium text-text-secondary mb-1.5"
            >
              Invite Key
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
              <input
                ref={inputRef}
                id="join-key"
                type="text"
                value={joinKey}
                onChange={(e) => {
                  setJoinKey(e.target.value);
                  setError(null);
                }}
                placeholder="Paste your invite key here"
                disabled={loading}
                className="w-full rounded-lg border border-border-subtle bg-surface-2/50 pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all disabled:opacity-50 font-mono"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-status-error/10 border border-status-error/20 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-status-error shrink-0" />
              <p className="text-xs text-status-error">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={loading || !joinKey.trim()}
              className="flex-1 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-4 py-2.5 text-sm font-medium text-surface-0 hover:shadow-[0_0_12px_rgba(255,214,10,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Joining…' : 'Join Organisation'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-surface-3/50 px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
