import type { Session, Task } from '@todo/contracts';

export const session: Session = {
  token: 'test-token',
  user: {
    id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: '2026-01-01T12:00:00Z',
  },
};
export const task = (id = 'one', patch: Partial<Task> = {}): Task => ({
  id,
  userId: session.user.id,
  title: `Task ${id}`,
  description: 'Some useful notes',
  completed: false,
  position: 0,
  version: 1,
  createdAt: '2026-01-01T12:00:00Z',
  updatedAt: '2026-01-01T12:00:00Z',
  ...patch,
});
