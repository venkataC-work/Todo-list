import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'react-router';
import type { Task } from '@todo/contracts';
import { cx } from '@/shared/lib/classes';
import { DeleteButton } from '@/shared/ui/DeleteButton';
import { CheckIcon, GripIcon } from '@/shared/ui/icons';
import { useTaskNavigation } from '../hooks/use-task-navigation';

interface TaskItemProps {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  disabled?: boolean;
}

export const TaskItem = ({ task, onToggle, onDelete, disabled = false }: TaskItemProps) => {
  const { search } = useTaskNavigation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx('task-item', task.completed && 'is-done', isDragging && 'is-dragging')}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="task-item__handle"
        disabled={disabled}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${task.title}`}
      >
        <GripIcon width={18} height={18} />
      </button>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={task.completed}
          disabled={disabled}
          onChange={() => onToggle(task)}
          aria-label={`Mark "${task.title}" as ${task.completed ? 'not done' : 'done'}`}
        />
        <span className="checkbox__box">
          <CheckIcon width={14} height={14} strokeWidth={3} />
        </span>
      </label>

      <Link to={`/tasks/${task.id}${search}`} className="task-item__body">
        <span className="task-item__content">
          <span className="task-item__title">{task.title}</span>
          {task.description && <span className="task-item__description">{task.description}</span>}
        </span>
      </Link>

      <DeleteButton label={task.title} disabled={disabled} onConfirm={() => onDelete(task)} />
    </li>
  );
};
