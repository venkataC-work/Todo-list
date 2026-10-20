import { Navigate, type RouteObject } from 'react-router';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { AppLayout } from './AppLayout';
import { AuthPage } from '@/features/auth/pages/AuthPage';
import { TasksPage } from '@/features/tasks/pages/TasksPage';
import { TaskDetailPage } from '@/features/tasks/pages/TaskDetailPage';
import { NewTaskPage } from '@/features/tasks/pages/NewTaskPage';

export const appRoutes: RouteObject[] = [
  { path: '/login', element: <AuthPage /> },
  { path: '/register', element: <AuthPage register /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { path: '/tasks', element: <TasksPage /> },
      { path: '/tasks/new', element: <NewTaskPage /> },
      { path: '/tasks/:id', element: <TaskDetailPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/tasks" replace /> },
];
