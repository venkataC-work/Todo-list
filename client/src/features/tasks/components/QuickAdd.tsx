import { useState, type FormEvent } from 'react';
import { useCreateTask } from '../hooks/use-tasks';
import { PlusIcon } from '@/shared/ui/icons';
import { useTaskNavigation } from '../hooks/use-task-navigation';

export const QuickAdd = () => {
  const [title, setTitle] = useState('');
  const createTask = useCreateTask();
  const { confirmCreated } = useTaskNavigation();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || createTask.isPending) return;
    createTask.mutate(
      { title: trimmed },
      {
        onSuccess: (task) => {
          setTitle('');
          confirmCreated(task);
        },
      },
    );
  };

  return (
    <form className="quick-add" onSubmit={handleSubmit}>
      <PlusIcon className="quick-add__icon" />
      <input
        id="quick-add-title"
        disabled={createTask.isPending}
        className="quick-add__input"
        value={title}
        maxLength={200}
        placeholder="Add a task and press Enter"
        aria-label="New task title"
        onChange={(event) => setTitle(event.target.value)}
      />
      <button
        type="submit"
        className="btn btn--secondary btn--sm"
        disabled={!title.trim() || createTask.isPending}
      >
        Add
      </button>
    </form>
  );
};
