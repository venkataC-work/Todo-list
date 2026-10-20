import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Task } from '@todo/contracts';
import { TaskItem } from './TaskItem';

interface TaskListProps {
  tasks: Task[];
  onReorder: (orderedIds: string[]) => void;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  disabled?: boolean;
}

const modifiers = [restrictToVerticalAxis];

export const TaskList = ({
  tasks,
  onReorder,
  onToggle,
  onDelete,
  disabled = false,
}: TaskListProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      scrollBehavior: 'auto',
    }),
  );
  const ids = tasks.map((task) => task.id);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={modifiers}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="task-list" aria-label="Tasks">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              disabled={disabled}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
};
