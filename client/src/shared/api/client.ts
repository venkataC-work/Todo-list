import { sessionStore } from '../session/session-store';
import { createHttpClient } from './http';

export const http = createHttpClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  getToken: () => sessionStore.get()?.token,
  onUnauthorized: (token) => {
    if (sessionStore.get()?.token === token) sessionStore.clear();
  },
});
