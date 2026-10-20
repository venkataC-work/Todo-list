import { useEffect, useState } from 'react';
import { cx } from '../lib/classes';
import { TrashIcon } from './icons';

interface DeleteButtonProps {
  label: string;
  onConfirm: () => void;
  variant?: 'icon' | 'full';
  disabled?: boolean;
}

const DISARM_AFTER_MS = 3000;

/** Two-step delete: first click arms the button, second click confirms. */
export const DeleteButton = ({
  label,
  onConfirm,
  variant = 'icon',
  disabled = false,
}: DeleteButtonProps) => {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), DISARM_AFTER_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      disabled={disabled}
      className={cx('btn-delete', `btn-delete--${variant}`, armed && 'is-armed')}
      aria-label={armed ? `Confirm delete ${label}` : `Delete ${label}`}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      <TrashIcon width={18} height={18} />
      {(armed || variant === 'full') && <span>{armed ? 'Confirm' : 'Delete'}</span>}
    </button>
  );
};
