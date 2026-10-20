import { createAuthService, type AuthService } from '../modules/auth/auth.service.js';
import { createTokenService, type TokenService } from '../modules/auth/tokens.js';
import type { Config } from '../config/env.js';
import type { Store } from '../infrastructure/store/store.js';
import { createTaskService, type TaskService } from '../modules/tasks/task.service.js';

export interface Services {
  tokens: TokenService;
  auth: AuthService;
  tasks: TaskService;
}

export const createServices = (
  store: Store,
  { jwtSecret, tokenTtlSeconds }: Pick<Config, 'jwtSecret' | 'tokenTtlSeconds'>,
): Services => {
  const tokens = createTokenService(jwtSecret, tokenTtlSeconds);
  return {
    tokens,
    auth: createAuthService({ store, tokens }),
    tasks: createTaskService({ store }),
  };
};
