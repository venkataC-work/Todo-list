import { dismissToast, toasts } from '../lib/toast';
import { useObservable } from '../lib/observable';
import { Link } from 'react-router';

export const Toaster = () => {
  const list = useObservable(toasts);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {list.map(({ id, message, tone, action }) =>
        action ? (
          <div key={id} className={`toast toast--${tone}`}>
            <p>{message}</p>
            <Link to={action.to} onClick={() => dismissToast(id)}>
              {action.label}
            </Link>
            <button
              type="button"
              className="toast__dismiss"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(id)}
            >
              Dismiss
            </button>
          </div>
        ) : (
          <button
            key={id}
            type="button"
            className={`toast toast--${tone}`}
            onClick={() => dismissToast(id)}
          >
            {message}
          </button>
        ),
      )}
    </div>
  );
};
