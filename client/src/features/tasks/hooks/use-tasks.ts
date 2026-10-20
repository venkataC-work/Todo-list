import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '../api/tasks-api';
import { ApiError } from '@/shared/api/http';
import type { NewTask, TaskFilters, TaskPatch } from '@todo/contracts';
import { sessionStore, useSession } from '@/shared/session/session-store';

export const taskKeys = {
  all: (userId: string) => ['tasks', userId] as const,
  list: (userId: string, filters: TaskFilters) => ['tasks', userId, 'list', filters] as const,
  detail: (userId: string, id: string) => ['tasks', userId, 'detail', id] as const,
};

export const ALL_TASKS: TaskFilters = { q: '', status: 'all' };

const useTaskOwner = () => useSession()?.user.id ?? '';

export const useTaskList = (filters: TaskFilters) => {
  const userId = useTaskOwner();
  return useQuery({
    queryKey: taskKeys.list(userId, filters),
    queryFn: ({ signal }) => tasksApi.list(filters, { signal }),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === userId ? previous : undefined,
    enabled: Boolean(userId),
  });
};

export const useTask = (id: string) => {
  const userId = useTaskOwner();
  return useQuery({
    queryKey: taskKeys.detail(userId, id),
    queryFn: ({ signal }) => tasksApi.get(id, { signal }),
    enabled: Boolean(userId && id),
  });
};

/** Serialize writes and refresh from the API so overlapping actions cannot undo each other. */
const useTaskMutation = <T, R>(mutationFn: (variables: T) => Promise<R>) => {
  const userId = useTaskOwner();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: taskKeys.all(userId),
    mutationFn: (variables: T) => {
      if (sessionStore.get()?.user.id !== userId) {
        return Promise.reject(
          new ApiError(401, 'UNAUTHORIZED', 'Your session has ended. Please sign in again.'),
        );
      }
      return mutationFn(variables);
    },
    scope: { id: `tasks:${userId}` },
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        return queryClient.invalidateQueries({ queryKey: taskKeys.all(userId) });
      }
      return undefined;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all(userId) }),
  });
};

export const useCreateTask = () => useTaskMutation((task: NewTask) => tasksApi.create(task));
export const useUpdateTask = () =>
  useTaskMutation(({ id, patch }: { id: string; patch: TaskPatch }) => tasksApi.update(id, patch));
export const useDeleteTask = () => useTaskMutation((id: string) => tasksApi.remove(id));
export const useReorderTasks = () => useTaskMutation((ids: string[]) => tasksApi.reorder(ids));
