import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const icons: Record<ToastVariant, typeof CheckCircle> = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
  };

  const styles: Record<ToastVariant, string> = {
    success: 'border-status-success/20 bg-status-success-dim text-status-success',
    error: 'border-status-error/20 bg-status-error-dim text-status-error',
    info: 'border-accent/20 bg-accent-dim text-accent',
  };

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}

      {/* Toast container */}
      <div className="fixed top-4 right-4 z-[100] space-y-2">
        {toasts.map((t) => {
          const Icon = icons[t.variant];
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
