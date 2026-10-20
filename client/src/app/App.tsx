import type { QueryClient } from '@tanstack/react-query';
import { Toaster } from '@/shared/ui/Toaster';
import { AppProviders } from './providers';
import { Outlet } from 'react-router';

export const App = ({ queryClient }: { queryClient?: QueryClient }) => (
  <AppProviders queryClient={queryClient}>
    <Outlet />
    <Toaster />
  </AppProviders>
);
