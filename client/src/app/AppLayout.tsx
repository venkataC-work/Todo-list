import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/features/auth/AuthContext';

export const AppLayout = () => {
  const { logout } = useAuth();
  const { pathname, search } = useLocation();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to={pathname === '/tasks' ? '/tasks' : `/tasks${search}`} className="app-title">
          Todo list
        </Link>
        <button type="button" className="sign-out" onClick={logout}>
          Sign out
        </button>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
};
