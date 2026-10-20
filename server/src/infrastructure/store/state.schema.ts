import { z } from 'zod';
import type { DataState } from './state.js';

const user = z.strictObject({
  id: z.string().min(1),
  email: z.email(),
  name: z.string().min(1).max(80),
  passwordHash: z.string().min(1),
  createdAt: z.iso.datetime(),
});

// Accept metadata from earlier versions so existing task files still load.
const task = z
  .strictObject({
    id: z.string().min(1),
    userId: z.string().min(1),
    title: z.string().min(1).max(200),
    description: z.string().max(5000),
    completed: z.boolean(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    dueDate: z.iso.date().nullable().optional(),
    position: z.number().int().nonnegative(),
    version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .transform((saved) => {
    const { priority, dueDate, ...task } = saved;
    void priority;
    void dueDate;
    return task;
  });

const stateSchema = z
  .strictObject({ users: z.array(user), tasks: z.array(task) })
  .superRefine((state, context) => {
    const userIds = new Set(state.users.map(({ id }) => id));
    const emails = new Set(state.users.map(({ email }) => email.toLowerCase()));
    const taskIds = new Set(state.tasks.map(({ id }) => id));
    if (
      userIds.size !== state.users.length ||
      emails.size !== state.users.length ||
      taskIds.size !== state.tasks.length
    ) {
      context.addIssue({ code: 'custom', message: 'User IDs, emails and task IDs must be unique' });
    }
    state.tasks.forEach(({ userId }, index) => {
      if (!userIds.has(userId))
        context.addIssue({
          code: 'custom',
          path: ['tasks', index, 'userId'],
          message: 'Task owner does not exist',
        });
    });
  }) satisfies z.ZodType<DataState>;

export const parseSavedState = (input: unknown): DataState => {
  const result = stateSchema.safeParse(input);
  if (!result.success) {
    throw new Error('Saved data is invalid. Restore a valid backup before starting the API.', {
      cause: result.error,
    });
  }
  return result.data;
};
