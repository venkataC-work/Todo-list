import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '@/shared/api/http';
import type { TaskInput } from '@todo/contracts';
import { TaskForm } from '../components/TaskForm';
import { BackToTasks } from '../components/BackToTasks';
import { useCreateTask } from '../hooks/use-tasks';
import { useUnsavedChanges } from '../hooks/use-unsaved-changes';
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog';
import { useTaskNavigation } from '../hooks/use-task-navigation';

export const NewTaskPage = () => {
  const navigate = useNavigate();
  const { listPath, confirmCreated } = useTaskNavigation();
  const create = useCreateTask();
  const [dirty, setDirty] = useState(false);
  const { blocker, allowLeave } = useUnsavedChanges(dirty);
  const save = (values: TaskInput) =>
    create.mutate(values, {
      onSuccess: (task) => {
        confirmCreated(task);
        allowLeave();
        void navigate(listPath);
      },
    });
  return (
    <section className="detail-page">
      <UnsavedChangesDialog blocker={blocker} />
      <BackToTasks />
      <h1>New task</h1>
      <p className="muted">Add a title and any details you need.</p>
      <div className="detail-card">
        <TaskForm
          submitLabel="Create task"
          onDirtyChange={setDirty}
          onSubmit={save}
          pending={create.isPending}
          serverErrors={create.error instanceof ApiError ? create.error.fieldErrors : {}}
        />
      </div>
    </section>
  );
};
