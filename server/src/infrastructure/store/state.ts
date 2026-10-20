import type { Task } from '@todo/contracts';
import type { User } from '../../modules/auth/auth.types.js';

export interface DataState {
  readonly users: readonly Readonly<User>[];
  readonly tasks: readonly Readonly<Task>[];
}
