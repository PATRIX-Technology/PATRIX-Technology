'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastTone = 'error' | 'info' | 'success';

interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const TONE_ICON_BG: Record<ToastTone, string> = {
  error: 'bg-coral-900/50 text-coral-300',
  info: 'bg-lagoon-900/50 text-lagoon-300',
  success: 'bg-lagoon-900/50 text-lagoon-300',
};

/**
 * Replaces ad-hoc red inline error text (and, for downloads, a raw
 * failed-navigation with no feedback at all) with a single consistent,
 * dismissible notification style app-wide. See docs/DECISIONS.md
 * "Toast notifications replace inline red errors".
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:end-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="animate-fadeIn pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-4 shadow-card"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE_ICON_BG[toast.tone ?? 'info']}`}
              aria-hidden="true"
            >
              {toast.tone === 'error' ? '!' : toast.tone === 'success' ? '✓' : '✦'}
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink-900">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-xs text-ink-600">{toast.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="focus-ring shrink-0 rounded-full p-1 text-ink-500 hover:bg-ink-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
