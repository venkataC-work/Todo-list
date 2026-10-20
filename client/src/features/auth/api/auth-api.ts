import type { Credentials, Registration, Session } from '@todo/contracts';
import { http } from '@/shared/api/client';

export const authApi = {
  login: (credentials: Credentials) => http.post<Session>('/api/auth/login', credentials),
  register: (registration: Registration) => http.post<Session>('/api/auth/register', registration),
};
