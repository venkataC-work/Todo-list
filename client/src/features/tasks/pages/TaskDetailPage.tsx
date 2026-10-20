import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError } from '@/shared/api/http';
import type { Task, TaskInput } from '@todo/contracts';
import { DeleteButton } from '@/shared/ui/DeleteButton';
import { TaskForm } from '../components/TaskForm';
import { BackToTasks } from '../components/BackToTasks';
import { useDeleteTask, useTask, useUpdateTask } from '../hooks/use-tasks';
import { useUnsavedChanges } from '../hooks/use-unsaved-changes';
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog';
import { changedTaskFields, formatTimestamp, toTaskInput } from '../lib/tasks';
import { useTaskNavigation } from '../hooks/use-task-navigation';

const isMissing = (error: Error | null) => error instanceof ApiError && error.status === 404;

const errorsOf = (error: Error | null) => (error instanceof ApiError ? error.fieldErrors : {});

// Keep the draft's original values and version until the user explicitly reloads.
const TaskEditor = ({
  task,
  reload,
  missing,
}: {
  task: Task;
  reload: () => Promise<Task | undefined>;
  missing: boolean;
}) => {
  const [baseline, setBaseline] = useState(task);
  const [reloading, setReloading] = useState(false);
  const navigate = useNavigate();
  const { listPath } = useTaskNavigation();
  const [dirty, setDirty] = useState(false);
  const { blocker, allowLeave } = useUnsavedChanges(dirty);
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const deleted = missing || isMissing(update.error) || isMissing(remove.error);
  const pending = update.isPending || remove.isPending || reloading;
  const conflicted =
    task.version !== baseline.version ||
    (update.error instanceof ApiError && update.error.status === 409);
  const save = (values: TaskInput) => {
    const patch = {
      ...changedTaskFields(values, toTaskInput(baseline)),
      version: baseline.version,
    };
    update.mutate(
      { id: task.id, patch },
      {
        onSuccess: () => {
          allowLeave();
          void navigate(listPath);
        },
      },
    );
  };
  const loadLatest = async () => {
    setReloading(true);
    try {
      const latest = await reload();
      if (latest) {
        setDirty(false);
        setBaseline(latest);
        update.reset();
      }
    } finally {
      setReloading(false);
    }
  };

  return (
    <>
      <UnsavedChangesDialog blocker={blocker} />
      {deleted && (
        <div className="form-error" role="alert">
          <p>
            This task was deleted. You can still copy your draft below before returning to the task
            list.
          </p>
        </div>
      )}
      {!deleted && conflicted && (
        <div className="form-error" role="alert">
          <p>
            This task changed in another tab. Your draft is still here. Load the latest task before
            editing again.
          </p>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={pending || deleted}
            onClick={() => void loadLatest()}
          >
            Discard draft and load latest
          </button>
        </div>
      )}
      <TaskForm
        key={baseline.version}
        initial={toTaskInput(baseline)}
        submitLabel="Save changes"
        pending={pending}
        readOnly={deleted}
        onDirtyChange={setDirty}
        serverErrors={errorsOf(update.error)}
        onSubmit={save}
        secondaryAction={
          <DeleteButton
            disabled={pending || deleted}
            variant="full"
            label={task.title}
            onConfirm={() =>
              remove.mutate(task.id, {
                onSuccess: () => {
                  allowLeave();
                  void navigate(listPath);
                },
              })
            }
          />
        }
      />
      <p className="task-timestamps">Last updated {formatTimestamp(task.updatedAt)}</p>
    </>
  );
};

export const TaskDetailPage = () => {
  const { id = '' } = useParams();
  const query = useTask(id);
  const reload = async () => {
    const result = await query.refetch();
    return result.isSuccess ? result.data : undefined;
  };
  if (query.isPending) return <p role="status">Loading task…</p>;
  if (!query.data)
    return (
      <section className="empty-state" role="alert">
        <BackToTasks />
        <h1>
          {query.error instanceof ApiError && query.error.status === 404
            ? 'Task not found'
            : 'Couldn’t load this task'}
        </h1>
        <p>{query.error?.message}</p>
        <button className="btn btn--secondary" onClick={() => void query.refetch()}>
          Try again
        </button>
      </section>
    );
  return (
    <section className="detail-page">
      <BackToTasks />
      <h1>{isMissing(query.error) ? 'Task deleted' : 'Edit task'}</h1>
      <p className="muted">Update the details below.</p>
      {query.isError && !isMissing(query.error) && (
        <div className="form-error" role="alert">
          <p>Couldn’t refresh this task. Your draft is still here.</p>
          <button
            className="btn btn--secondary"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </div>
      )}
      <div className="detail-card">
        <TaskEditor
          key={query.data.id}
          task={query.data}
          reload={reload}
          missing={isMissing(query.error)}
        />
      </div>
    </section>
  );
};
