'use client';

import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      toastOptions={{
        classNames: {
          toast: 'bg-white shadow-lg border rounded-lg',
          error: 'border-red-200 bg-red-50',
          success: 'border-green-200 bg-green-50',
        },
      }}
    />
  );
}
