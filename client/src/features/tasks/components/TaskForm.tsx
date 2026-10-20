import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { TaskInput } from '@todo/contracts';

interface TaskFormProps {
  initial?: TaskInput;
  submitLabel: string;
  pending?: boolean;
  readOnly?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  serverErrors?: Record<string, string>;
  onSubmit: (values: TaskInput) => void;
  secondaryAction?: ReactNode;
}

const EMPTY_TASK: TaskInput = {
  title: '',
  description: '',
  completed: false,
};

const isDirty = (values: TaskInput, initial: TaskInput) =>
  (Object.keys(values) as Array<keyof TaskInput>).some((key) => values[key] !== initial[key]);

export const TaskForm = ({
  initial = EMPTY_TASK,
  submitLabel,
  pending = false,
  readOnly = false,
  onDirtyChange,
  serverErrors = {},
  onSubmit,
  secondaryAction,
}: TaskFormProps) => {
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const normalized = {
    ...values,
    title: values.title.trim(),
    description: values.description.trim(),
  };
  const dirty = isDirty(normalized, initial);
  const unchanged = initial !== EMPTY_TASK && !dirty;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const set =
    <K extends keyof TaskInput>(key: K) =>
    (value: TaskInput[K]) =>
      setValues((current) => ({ ...current, [key]: value }));

  const titleError =
    (submitted && !values.title.trim() && 'Title is required') || serverErrors.title;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!normalized.title || pending || readOnly || unchanged) return;
    onSubmit(normalized);
  };

  return (
    <form className="task-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="task-title">Title</label>
        <input
          id="task-title"
          readOnly={readOnly}
          disabled={pending}
          className="input input--lg"
          value={values.title}
          maxLength={200}
          placeholder="What needs to be done?"
          aria-invalid={Boolean(titleError)}
          aria-describedby={titleError ? 'task-title-error' : undefined}
          onChange={(event) => set('title')(event.target.value)}
          autoFocus
        />
        {titleError && (
          <p id="task-title-error" className="field__error" role="alert">
            {titleError}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="task-description">Notes</label>
        <textarea
          id="task-description"
          readOnly={readOnly}
          disabled={pending}
          className="input textarea"
          rows={5}
          maxLength={5000}
          value={values.description}
          placeholder="Add any useful details (optional)"
          onChange={(event) => set('description')(event.target.value)}
        />
      </div>

      <label className="switch">
        <input
          type="checkbox"
          disabled={pending || readOnly}
          checked={values.completed}
          onChange={(event) => set('completed')(event.target.checked)}
        />
        <span className="switch__track" aria-hidden="true">
          <span className="switch__thumb" />
        </span>
        Completed
      </label>

      <div className="task-form__actions">
        {secondaryAction}
        <button
          type="submit"
          className="btn btn--primary"
          disabled={pending || readOnly || unchanged}
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
};
