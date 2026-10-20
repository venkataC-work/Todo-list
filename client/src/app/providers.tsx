import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/AuthContext';
import { createQueryClient } from './query-client';

interface AppProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

export const AppProviders = ({ children, queryClient }: AppProvidersProps) => {
  const [defaultClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient ?? defaultClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
};
