'use client';
import * as React from 'react';
import { Button } from './Button';
import { Icon } from './icons';
import { cx, TONE_ICON, TONE_LABEL, type StatusTone } from './utils';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Default `success`: most toasts confirm something just happened. */
  tone?: StatusTone;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** One action (this is the "snackbar" pattern), e.g. Undo. */
  action?: ToastAction;
  /** ms before it closes; `Infinity` keeps it. Default: the provider's duration, at least 10s with an action. */
  duration?: number;
}

export interface ToastProps extends ToastOptions {
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
}

/** One notification. Usually created with `useToast().show()`; render directly for static layouts. */
export function Toast({ tone = 'success', title, description, action, onDismiss, dismissLabel = 'Dismiss', className }: ToastProps) {
  return (
    <div className={cx('ae-toast', `ae-tone-${tone}`, className)}>
      <Icon name={TONE_ICON[tone]} size={20} label={TONE_LABEL[tone]} className="ae-toast__icon" />
      <div className="ae-toast__body">
        <p className="ae-toast__title ae-label">{title}</p>
        {description && <p className="ae-toast__text ae-body-sm">{description}</p>}
      </div>
      {action && (
        <Button size="sm" variant="tertiary" className="ae-toast__action" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {onDismiss && (
        <button type="button" className="ae-close" aria-label={dismissLabel} onClick={onDismiss}>
          <Icon name="x" size={20} />
        </button>
      )}
    </div>
  );
}

interface ToastApi {
  /** Shows a toast and returns its id. */
  show: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

export interface ToastProviderProps {
  children?: React.ReactNode;
  /** Default ms before a toast closes. Default 6000. */
  duration?: number;
  /** Name of the notifications region. Default "Notifications". */
  label?: string;
}

/** Hosts the polite live region that toasts appear in; wrap the app once (in a client providers file). */
export function ToastProvider({ children, duration = 6000, label = 'Notifications' }: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<Array<ToastOptions & { id: string }>>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const live = React.useRef(toasts);
  live.current = toasts;

  const dismiss = React.useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const lifetime = React.useCallback((t: ToastOptions) => t.duration ?? (t.action ? Math.max(duration, 10000) : duration), [duration]);

  const schedule = React.useCallback(
    (id: string, ms: number) => {
      if (Number.isFinite(ms)) timers.current.set(id, setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  const show = React.useCallback(
    (options: ToastOptions) => {
      const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      setToasts((list) => [...list, { ...options, id }]);
      schedule(id, lifetime(options));
      return id;
    },
    [lifetime, schedule],
  );

  const pause = () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  };
  const resume = () => live.current.forEach((t) => schedule(t.id, lifetime(t)));

  React.useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  const api = React.useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section aria-label={label} onMouseEnter={pause} onMouseLeave={resume} onFocus={pause} onBlur={resume}>
        <ol className="ae-toast-region" aria-live="polite" aria-relevant="additions">
          {toasts.map(({ id, ...t }) => (
            <li key={id}>
              <Toast {...t} onDismiss={() => dismiss(id)} />
            </li>
          ))}
        </ol>
      </section>
    </ToastContext.Provider>
  );
}

/** Returns `{ show, dismiss }`. Must be used inside ToastProvider. */
export function useToast(): ToastApi {
  const api = React.useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>.');
  return api;
}
