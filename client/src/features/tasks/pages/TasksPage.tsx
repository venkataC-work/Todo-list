import { Link, useSearchParams } from 'react-router';
import type { StatusFilter } from '@todo/contracts';
import { FilterTabs } from '../components/FilterTabs';
import { QuickAdd } from '../components/QuickAdd';
import { TaskList } from '../components/TaskList';
import { PlusIcon, SearchIcon } from '@/shared/ui/icons';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import {
  ALL_TASKS,
  useDeleteTask,
  useReorderTasks,
  useTaskList,
  useUpdateTask,
} from '../hooks/use-tasks';
import { summarize } from '../lib/tasks';
import { useTaskNavigation } from '../hooks/use-task-navigation';

export const TasksPage = () => {
  const { search: listSearch } = useTaskNavigation();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status');
  const status: StatusFilter =
    statusParam === 'active' || statusParam === 'completed' ? statusParam : 'all';
  const search = params.get('q') ?? '';
  const q = useDebouncedValue(search.trim());
  const all = useTaskList(ALL_TASKS);
  const list = useTaskList({ q, status });
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const reorder = useReorderTasks();
  const tasks = list.data ?? [];
  const summary = all.data && !all.isError ? summarize(all.data) : undefined;
  const counts = summary && {
    all: summary.total,
    active: summary.active,
    completed: summary.completed,
  };
  const unfiltered = !q && status === 'all';

  const setFilters = (nextStatus: StatusFilter, nextSearch: string) => {
    setParams(
      { ...(nextStatus !== 'all' && { status: nextStatus }), ...(nextSearch && { q: nextSearch }) },
      // Commit controlled filters before another input event can read the previous URL.
      { replace: true, flushSync: true },
    );
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Tasks</h1>
          <p className="muted">
            {summary
              ? `${summary.active} ${summary.active === 1 ? 'active task' : 'active tasks'}`
              : all.isError
                ? 'Task counts unavailable'
                : 'Loading task counts…'}
          </p>
        </div>
        <Link className="btn btn--primary" to={`/tasks/new${listSearch}`}>
          <PlusIcon /> New task
        </Link>
      </div>
      <QuickAdd />
      <div className="list-toolbar">
        <FilterTabs value={status} counts={counts} onChange={(next) => setFilters(next, search)} />
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            aria-label="Search tasks"
            placeholder="Search your tasks…"
            value={search}
            maxLength={200}
            onChange={(event) => {
              setFilters(status, event.target.value);
            }}
          />
        </label>
      </div>
      {all.isError && !unfiltered && (
        <div className="form-error list-warning" role="alert">
          <p>Couldn’t refresh task counts. Your task list is shown separately below.</p>
          <button
            className="btn btn--secondary"
            disabled={all.isFetching}
            onClick={() => void all.refetch()}
          >
            Retry task counts
          </button>
        </div>
      )}
      {list.isError && list.data !== undefined && (
        <div className="form-error list-warning" role="alert">
          <p>Couldn’t refresh your tasks. Showing the last saved list.</p>
          <button
            className="btn btn--secondary"
            disabled={list.isFetching}
            onClick={() => void list.refetch()}
          >
            Retry task list
          </button>
        </div>
      )}
      {list.isPending ? (
        <p className="empty-state" role="status">
          Loading your tasks…
        </p>
      ) : list.isError && list.data === undefined ? (
        <div className="empty-state" role="alert">
          <h2>Couldn’t load your tasks</h2>
          <p>{list.error.message}</p>
          <button
            className="btn btn--secondary"
            disabled={list.isFetching}
            onClick={() => void list.refetch()}
          >
            Try again
          </button>
        </div>
      ) : tasks.length ? (
        <div
          aria-busy={list.isFetching || update.isPending || remove.isPending || reorder.isPending}
        >
          <TaskList
            disabled={
              update.isPending ||
              remove.isPending ||
              reorder.isPending ||
              list.isPlaceholderData ||
              list.isError
            }
            tasks={tasks}
            onToggle={(task) =>
              update.mutate({
                id: task.id,
                patch: { completed: !task.completed, version: task.version },
              })
            }
            onDelete={(task) => remove.mutate(task.id)}
            onReorder={(ids) => reorder.mutate(ids)}
          />
        </div>
      ) : (
        <div className="empty-state">
          <h2>
            {q
              ? 'No matching tasks'
              : status === 'completed'
                ? 'No completed tasks'
                : status === 'active'
                  ? 'No active tasks'
                  : 'No tasks yet'}
          </h2>
          <p>
            {q
              ? 'Try another word or clear your search.'
              : status === 'completed'
                ? 'Completed tasks will appear here.'
                : status === 'active'
                  ? 'Add a task or switch to another filter.'
                  : 'Add your first task using the field above.'}
          </p>
        </div>
      )}
      <footer className="list-footer">
        <details className="list-help">
          <summary>Reorder tasks</summary>
          <p>
            Drag a task’s handle to change its position. With a keyboard, focus the handle, press
            Space, use the arrow keys, then press Space to save or Escape to cancel.
          </p>
        </details>
      </footer>
    </>
  );
};
