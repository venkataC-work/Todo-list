import { randomUUID } from 'node:crypto';
import { conflict, unauthorized } from '../../shared/errors.js';
import type { Store } from '../../infrastructure/store/store.js';
import type { PublicUser, Session } from '@todo/contracts';
import type { User } from './auth.types.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';
import { hashPassword, verifyPassword } from './password.js';
import type { TokenService } from './tokens.js';

export interface AuthService {
  register: (input: RegisterInput) => Promise<Session>;
  login: (input: LoginInput) => Promise<Session>;
  getUser: (id: string) => Promise<PublicUser>;
}

interface Deps {
  store: Store;
  tokens: TokenService;
  clock?: () => string;
  generateId?: () => string;
}

export const toPublicUser = ({ passwordHash, ...user }: User): PublicUser => user;

export const createAuthService = ({
  store,
  tokens,
  clock = () => new Date().toISOString(),
  generateId = randomUUID,
}: Deps): AuthService => {
  // Verifying against a throwaway hash for unknown emails keeps response timing uniform,
  // so attackers cannot enumerate registered accounts.
  const decoyHash = hashPassword(randomUUID());
  const toSession = (user: User): Session => ({
    token: tokens.sign(user.id),
    user: toPublicUser(user),
  });
  const findUser = async (predicate: (user: User) => boolean) =>
    (await store.read()).users.find(predicate);

  return {
    register: async ({ email, password, name }) => {
      const passwordHash = await hashPassword(password);
      const user = await store.update((state) => {
        if (state.users.some((existing) => existing.email === email)) {
          throw conflict('An account with this email already exists');
        }
        const created: User = { id: generateId(), email, name, passwordHash, createdAt: clock() };
        return { state: { ...state, users: [...state.users, created] }, result: created };
      });
      return toSession(user);
    },

    login: async ({ email, password }) => {
      const user = await findUser((candidate) => candidate.email === email);
      const valid = await verifyPassword(password, user?.passwordHash ?? (await decoyHash));
      if (!user || !valid) throw unauthorized('Invalid email or password');
      return toSession(user);
    },

    getUser: async (id) => {
      const user = await findUser((candidate) => candidate.id === id);
      if (!user) throw unauthorized();
      return toPublicUser(user);
    },
  };
};
