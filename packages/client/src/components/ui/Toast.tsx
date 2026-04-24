import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle, AlertCircle, Info, X, Sparkles } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info' | 'action';

interface BaseToast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ActionToast extends BaseToast {
  variant: 'action';
  onConfirm: () => void | Promise<void>;
  confirmLabel: string;
}

type Toast = BaseToast | ActionToast;

/** Extra options accepted by the object-form call `toast({ ... })`.
 *  Keeps the legacy positional call `toast(msg, 'success')` intact. */
export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  /** Required when `variant === 'action'`. Fired by the inline button
   *  and by the ⌘+Enter / Ctrl+Enter shortcut while the toast is
   *  focused. */
  onConfirm?: () => void | Promise<void>;
  /** Label shown on the inline action button. Defaults to `⌘↵`. */
  confirmLabel?: string;
}

interface ToastContextType {
  /**
   * Legacy positional signature preserved for every existing caller:
   *   toast('Saved', 'success') | toast('Boom', 'error')
   *
   * Object form for action toasts (Step 6 — D-R2 / 4A):
   *   toast({ message, variant: 'action', onConfirm, confirmLabel: '⌘↵' })
   */
  toast: (msgOrOpts: string | ToastOptions, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/** Timeouts — action toasts get longer since the user has to decide. */
const AUTO_DISMISS_MS: Record<ToastVariant, number> = {
  success: 4000,
  error: 6000,
  info: 4000,
  action: 10_000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((msgOrOpts: string | ToastOptions, variant?: ToastVariant) => {
    const id = crypto.randomUUID();
    let next: Toast;
    if (typeof msgOrOpts === 'string') {
      next = { id, message: msgOrOpts, variant: variant ?? 'info' };
    } else {
      const v = msgOrOpts.variant ?? 'info';
      if (v === 'action') {
        if (!msgOrOpts.onConfirm) {
          // Action without a handler makes no sense — degrade to info
          // so we never swallow the message silently.
          next = { id, message: msgOrOpts.message, variant: 'info' };
        } else {
          next = {
            id,
            message: msgOrOpts.message,
            variant: 'action',
            onConfirm: msgOrOpts.onConfirm,
            confirmLabel: msgOrOpts.confirmLabel ?? '⌘↵',
          };
        }
      } else {
        next = { id, message: msgOrOpts.message, variant: v };
      }
    }
    setToasts((prev) => [...prev, next]);
    const dismissMs = AUTO_DISMISS_MS[next.variant];
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, dismissMs);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const icons: Record<ToastVariant, typeof CheckCircle> = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
    action: Sparkles,
  };

  const styles: Record<ToastVariant, string> = {
    success: 'border-status-success/20 bg-status-success-dim text-status-success',
    error: 'border-status-error/20 bg-status-error-dim text-status-error',
    info: 'border-accent/20 bg-accent-dim text-accent',
    action:
      'border-accent/40 bg-gradient-to-r from-accent/15 to-amber-500/10 text-accent shadow-[0_0_18px_rgba(255,214,10,0.2)]',
  };

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}

      {/* Toast container */}
      <div className="fixed top-4 right-4 z-[100] space-y-2">
        {toasts.map((t) => {
          const Icon = icons[t.variant];
          if (t.variant === 'action') {
            const action = t as ActionToast;
            return (
              <ActionToastItem
                key={t.id}
                toast={action}
                style={styles.action}
                Icon={Icon}
                onDismiss={() => removeToast(action.id)}
              />
            );
          }
          return (
            <div
              key={t.id}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-dark-lg backdrop-blur-glass transition-all animate-slide-in-right ${styles[t.variant]}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <p className="text-sm font-medium">{t.message}</p>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="ml-2 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// ────────────────────────────────────────────────────────────────────
// Action toast — glass-morphism card with inline confirm button and
// keyboard shortcut (⌘+Enter / Ctrl+Enter) while focused.
// ────────────────────────────────────────────────────────────────────

function ActionToastItem({
  toast,
  style,
  Icon,
  onDismiss,
}: {
  toast: ActionToast;
  style: string;
  Icon: typeof CheckCircle;
  onDismiss: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Auto-focus so the keyboard shortcut "just works" for the user who
  // was already reaching for the keyboard when the toast appeared.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const confirm = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await toast.onConfirm();
    } finally {
      onDismiss();
    }
  }, [isBusy, toast, onDismiss]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void confirm();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onDismiss();
    }
  };

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      role="alertdialog"
      aria-label={toast.message}
      data-testid="action-toast"
      onKeyDown={onKeyDown}
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-dark-lg backdrop-blur-glass transition-all animate-slide-in-right focus:outline-none focus:ring-2 focus:ring-accent/60 ${style}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <p className="text-sm font-medium flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={() => void confirm()}
        disabled={isBusy}
        data-testid="action-toast-confirm"
        className="shrink-0 rounded-md border border-accent/40 bg-accent/20 px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/30 disabled:opacity-50"
      >
        {isBusy ? '…' : toast.confirmLabel}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
