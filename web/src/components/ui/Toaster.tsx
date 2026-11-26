'use client';

import * as RadixToast from '@radix-ui/react-toast';
import { useTranslations } from 'next-intl';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import type { AlertTone } from './Alert';
import styles from './feedback.module.css';
import { Toast } from './Toast';

export type ToastSpec = {
  /** Showing a toast with the id of one that is open replaces it. */
  id: string;
  title: string;
  description?: ReactNode;
  tone?: AlertTone;
  icon?: ReactNode;
  /** A button or anchor. `actionLabel` is its text for screen readers, which announce it as a shortcut. */
  action?: ReactElement;
  actionLabel?: string;
  /** Milliseconds before it closes by itself; hovering or focusing it holds it open. Omit to keep it. */
  duration?: number;
};

type Toaster = {
  show: (toast: ToastSpec) => void;
  dismiss: (id: string) => void;
};

const NOOP: Toaster = { show: () => {}, dismiss: () => {} };
const ToasterContext = createContext<Toaster>(NOOP);

/** Opens and closes toasts. Outside a `ToasterProvider` the calls do nothing. */
export function useToaster(): Toaster {
  return useContext(ToasterContext);
}

/**
 * One stack of toasts for the whole app (Radix Toast): bottom-right on desktop,
 * bottom-centre on a phone. Put it once in a layout; pages call `useToaster()`.
 */
export function ToasterProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('ui');
  const [toasts, setToasts] = useState<ToastSpec[]>([]);

  const show = useCallback((toast: ToastSpec) => {
    setToasts((all) =>
      all.some((x) => x.id === toast.id)
        ? all.map((x) => (x.id === toast.id ? toast : x))
        : [...all, toast],
    );
  }, []);
  const dismiss = useCallback((id: string) => {
    setToasts((all) => (all.some((x) => x.id === id) ? all.filter((x) => x.id !== id) : all));
  }, []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToasterContext.Provider value={api}>
      <RadixToast.Provider swipeDirection="right" duration={Infinity} label={t('toaster.region')}>
        {children}
        {toasts.map((toast) => (
          <RadixToast.Root
            key={toast.id}
            // Errors interrupt screen readers; the rest wait for a pause (aria-live polite).
            type={toast.tone === 'error' ? 'foreground' : 'background'}
            duration={toast.duration ?? Infinity}
            onOpenChange={(open) => {
              if (!open) dismiss(toast.id);
            }}
            asChild
          >
            <li>
              <Toast
                bare
                tone={toast.tone}
                icon={toast.icon}
                title={toast.title}
                description={toast.description}
                action={
                  toast.action && (
                    <RadixToast.Action asChild altText={toast.actionLabel ?? toast.title}>
                      {toast.action}
                    </RadixToast.Action>
                  )
                }
                closeLabel={t('toastClose')}
                onClose={() => dismiss(toast.id)}
              />
            </li>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className={styles.viewport} label={t('toaster.region')} />
      </RadixToast.Provider>
    </ToasterContext.Provider>
  );
}
