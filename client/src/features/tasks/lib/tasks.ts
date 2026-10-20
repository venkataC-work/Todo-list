import type { Task, TaskInput } from '@todo/contracts';

export const toTaskInput = ({ title, description, completed }: Task): TaskInput => ({
  title,
  description,
  completed,
});

export const changedTaskFields = (values: TaskInput, initial: TaskInput): Partial<TaskInput> =>
  Object.fromEntries(
    Object.entries(values).filter(([key, value]) => value !== initial[key as keyof TaskInput]),
  );

export const summarize = (tasks: readonly Task[]) =>
  tasks.reduce(
    (summary, { completed }) => ({
      total: summary.total + 1,
      completed: summary.completed + Number(completed),
      active: summary.active + Number(!completed),
    }),
    { total: 0, completed: 0, active: 0 },
  );

export const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
