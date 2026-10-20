import { useLocation } from 'react-router';
import { useEffect, useRef } from 'react';
import type { Task } from '@todo/contracts';
import { notify } from '@/shared/lib/toast';

/** Keep list settings in the URL so they survive refreshes and browser navigation. */
export const useTaskNavigation = () => {
  const { search } = useLocation();
  const currentSearch = useRef(search);
  useEffect(() => {
    currentSearch.current = search;
  }, [search]);
  const listPath = `/tasks${search}`;
  const confirmCreated = (task: Task) => {
    // A quick addition may finish after the user has changed filters.
    const latestSearch = currentSearch.current;
    const params = new URLSearchParams(latestSearch);
    const query = (params.get('q') ?? '').trim().toLowerCase();
    const status = params.get('status');
    const hidden =
      (query &&
        ![task.title, task.description].some((text) => text.toLowerCase().includes(query))) ||
      (status === 'completed' && !task.completed) ||
      (status === 'active' && task.completed);
    if (hidden) {
      notify('Task added. Hidden by your current search or filter.', 'success', 8000, {
        label: 'View task',
        to: `/tasks/${task.id}${latestSearch}`,
      });
    }
  };
  return { search, listPath, confirmCreated };
};
