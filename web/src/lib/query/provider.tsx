'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { errorToToast, type ToastMessage } from '@/lib/api/errors';

type ToastHandler = (toast: ToastMessage) => void;

let toastHandler: ToastHandler | undefined;

/** The UI shell registers how toasts are shown; returns an unsubscribe. */
export function setToastHandler(handler: ToastHandler | undefined): () => void {
  toastHandler = handler;
  return () => {
    if (toastHandler === handler) toastHandler = undefined;
  };
}

function notify(error: unknown) {
  toastHandler?.(errorToToast(error));
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: notify }),
    mutationCache: new MutationCache({ onError: notify }),
    defaultOptions: {
      queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
