import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteButton } from './DeleteButton';
import { dismissToast, notify, toasts } from '../lib/toast';

describe('timed confirmations and notifications', () => {
  it('disarms deletion after three seconds', () => {
    vi.useFakeTimers();
    try {
      const confirm = vi.fn();
      render(<DeleteButton label="Read" onConfirm={confirm} />);
      act(() => screen.getByRole('button', { name: 'Delete Read' }).click());
      expect(screen.getByRole('button', { name: 'Confirm delete Read' })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(3000));
      expect(screen.getByRole('button', { name: 'Delete Read' })).toBeInTheDocument();
      expect(confirm).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('expires toasts and supports explicit dismissal', () => {
    vi.useFakeTimers();
    try {
      notify('Saved', 'success', 100);
      notify('Failed');
      const [first, second] = toasts.get();
      expect(first?.tone).toBe('success');
      act(() => vi.advanceTimersByTime(100));
      expect(toasts.get().map(({ message }) => message)).toEqual(['Failed']);
      dismissToast(second!.id);
      expect(toasts.get()).toEqual([]);
      vi.runAllTimers();
    } finally {
      vi.useRealTimers();
    }
  });
});
