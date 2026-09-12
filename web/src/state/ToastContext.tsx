import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastValue {
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastValue | null>(null);
const VISIBLE_MS = 4200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), VISIBLE_MS);
    },
    [dismiss]
  );

  const value = useMemo<ToastValue>(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-20 sm:pb-6"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={[
              'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm shadow-overlay animate-toast-in',
              toast.tone === 'error'
                ? 'border-rose-500/30 bg-rose-50 text-rose-900 dark:bg-rose-950/80 dark:text-rose-100'
                : toast.tone === 'info'
                  ? 'border-hairline bg-surface text-ink'
                  : 'border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-100',
            ].join(' ')}
          >
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              {toast.tone === 'error' ? '!' : toast.tone === 'info' ? 'i' : '✓'}
            </span>
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 rounded px-1 text-xs opacity-60 transition-opacity hover:opacity-100"
              aria-label="Dismiss notification"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
