import { useEffect, useRef } from 'react';
import type { Blocker } from 'react-router';

export const UnsavedChangesDialog = ({ blocker }: { blocker: Blocker }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (blocker.state !== 'blocked' || !element) return;
    element.showModal();
    return () => element.close();
  }, [blocker.state]);
  if (blocker.state !== 'blocked') return null;
  return (
    <dialog
      ref={dialog}
      className="unsaved-dialog"
      aria-labelledby="unsaved-title"
      onCancel={(event) => {
        event.preventDefault();
        blocker.reset();
      }}
    >
      <h2 id="unsaved-title">Unsaved changes</h2>
      <p>Leave this page and discard your changes?</p>
      <div className="unsaved-dialog__actions">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => blocker.reset()}
          autoFocus
        >
          Keep editing
        </button>
        <button type="button" className="btn btn--primary" onClick={() => blocker.proceed()}>
          Discard changes and leave
        </button>
      </div>
    </dialog>
  );
};
