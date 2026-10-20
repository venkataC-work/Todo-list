import type { NewTask, Task, TaskFilters, TaskPatch } from '@todo/contracts';
import type { RequestOptions } from '@/shared/api/http';
import { http } from '@/shared/api/client';

const toQueryString = (filters: Partial<TaskFilters>) => {
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value && value !== 'all'),
  ).toString();
  return params && `?${params}`;
};

const taskPath = (id: string) => `/api/tasks/${encodeURIComponent(id)}`;

export const tasksApi = {
  list: (filters: Partial<TaskFilters> = {}, options?: RequestOptions) =>
    http.get<Task[]>(`/api/tasks${toQueryString(filters)}`, options),
  get: (id: string, options?: RequestOptions) => http.get<Task>(taskPath(id), options),
  create: (task: NewTask) => http.post<Task>('/api/tasks', task),
  update: (id: string, patch: TaskPatch) => http.patch<Task>(taskPath(id), patch),
  remove: (id: string) => http.delete(taskPath(id)),
  reorder: (ids: string[]) => http.put<Task[]>('/api/tasks/order', { ids }),
};
