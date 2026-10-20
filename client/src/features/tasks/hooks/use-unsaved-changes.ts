import { useCallback, useRef } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router';
import { sessionStore } from '@/shared/session/session-store';

export const useUnsavedChanges = (dirty: boolean) => {
  const allowed = useRef(false);
  const shouldWarn = useCallback(
    () => dirty && !allowed.current && Boolean(sessionStore.get()),
    [dirty],
  );
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname && shouldWarn(),
  );
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (shouldWarn()) {
          event.preventDefault();
          event.returnValue = '';
        }
      },
      [shouldWarn],
    ),
  );
  const allowLeave = () => {
    allowed.current = true;
  };
  return { blocker, allowLeave };
};
