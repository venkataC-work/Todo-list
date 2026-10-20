import type { TaskInput, TaskPatch, TaskFilters } from '@todo/contracts';
import { z } from 'zod';

const title = z.string().trim().min(1, 'Title is required').max(200);
const description = z.string().trim().max(5000);
const completed = z.boolean();

export const createTaskSchema = z.strictObject({
  title,
  description: description.default(''),
  completed: completed.default(false),
}) satisfies z.ZodType<TaskInput>;

export const updateTaskSchema = z
  .strictObject({
    title: title.optional(),
    description: description.optional(),
    completed: completed.optional(),
    version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .refine(
    (patch) => Object.keys(patch).some((key) => key !== 'version'),
    'Provide at least one field to update',
  ) satisfies z.ZodType<TaskPatch>;

export const reorderSchema = z.strictObject({
  ids: z
    .array(z.string().min(1))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, 'Task ids must be unique'),
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['all', 'active', 'completed']).default('all'),
}) satisfies z.ZodType<Partial<TaskFilters>>;

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
