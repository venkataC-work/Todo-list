import type { PublicUser } from '@todo/contracts';

export interface User extends PublicUser {
  passwordHash: string;
}
