import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { appRoutes } from './routes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { authApi } from '@/features/auth/api/auth-api';
import { tasksApi } from '@/features/tasks/api/tasks-api';
import { ApiError } from '@/shared/api/http';
import type { Task } from '@todo/contracts';
import { sessionStore } from '@/shared/session/session-store';
import { createQueryClient } from './query-client';
import { session, task } from '@/test/fixtures';

let tasks: Task[];

beforeEach(() => {
  tasks = [
    task('one'),
    task('two', {
      title: 'Book appointment',
      completed: true,
      description: '',
      position: 1,
    }),
  ];
  vi.spyOn(tasksApi, 'list').mockImplementation(async ({ q = '', status = 'all' } = {}) =>
    tasks.filter(
      (item) =>
        (!q || `${item.title} ${item.description}`.toLowerCase().includes(q.toLowerCase())) &&
        (status === 'all' || item.completed === (status === 'completed')),
    ),
  );
  vi.spyOn(tasksApi, 'get').mockImplementation(async (id) => {
    const found = tasks.find((item) => item.id === id);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Task not found');
    return found;
  });
  vi.spyOn(tasksApi, 'create').mockImplementation(async (values) => {
    const created = task('created', values);
    tasks = [created, ...tasks];
    return created;
  });
  vi.spyOn(tasksApi, 'update').mockImplementation(async (id, patch) => {
    const current = tasks.find((item) => item.id === id)!;
    if (patch.version !== current.version)
      throw new ApiError(409, 'CONFLICT', 'This task changed in another tab.');
    const updated = { ...current, ...patch, version: current.version + 1 };
    tasks = tasks.map((item) => (item.id === id ? updated : item));
    return updated;
  });
  vi.spyOn(tasksApi, 'remove').mockImplementation(async (id) => {
    tasks = tasks.filter((item) => item.id !== id);
  });
  vi.spyOn(tasksApi, 'reorder').mockImplementation(async (ids) => {
    tasks = ids.map((id) => tasks.find((item) => item.id === id)!);
    return tasks;
  });
});

const openApp = (path = '/tasks', signedIn = true) => {
  if (signedIn) sessionStore.set(session);
  const queryClient = createQueryClient(false);
  const router = createMemoryRouter(
    [{ element: <App queryClient={queryClient} />, children: appRoutes }],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return { user: userEvent.setup(), queryClient, router };
};
const signIn = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Email address'), session.user.email);
  await user.type(screen.getByLabelText('Password'), 'correct-horse');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('sign-in and account boundaries', () => {
  it.each([
    ['login', false],
    ['login', true],
    ['register', false],
    ['register', true],
  ] as const)(
    'ignores a late %s response after a newer session (signed out: %s)',
    async (method, signOut) => {
      let finish!: (value: typeof session) => void;
      const pending = new Promise<typeof session>((resolve) => {
        finish = resolve;
      });
      vi.spyOn(authApi, method).mockReturnValue(pending);
      const { user } = openApp(method === 'login' ? '/login' : '/register', false);
      if (method === 'register') await user.type(screen.getByLabelText('Your name'), 'Ada');
      await user.type(screen.getByLabelText('Email address'), session.user.email);
      await user.type(screen.getByLabelText('Password'), 'correct-horse');
      await user.click(
        screen.getByRole('button', { name: method === 'login' ? 'Sign in' : 'Create account' }),
      );
      const newer = {
        ...session,
        token: 'newer-session',
        user: { ...session.user, id: 'another-user' },
      };
      await act(async () => {
        sessionStore.set(newer);
      });
      await screen.findByRole('button', { name: 'Sign out' });
      if (signOut) await user.click(screen.getByRole('button', { name: 'Sign out' }));
      await act(async () => {
        finish(session);
        await pending;
      });
      expect(sessionStore.get()).toEqual(signOut ? null : newer);
      if (signOut) expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    },
  );

  it.each([
    '/tasks?status=completed&q=appointment',
    '/tasks/two?status=completed&q=appointment#details',
  ])('preserves the complete protected URL after sign-in: %s', async (path) => {
    vi.spyOn(authApi, 'login').mockResolvedValue(session);
    const { user, router } = openApp(path, false);
    await signIn(user);
    await waitFor(() => {
      const { pathname, search, hash } = router.state.location;
      expect(`${pathname}${search}${hash}`).toBe(path);
    });
    if (path.includes('/two')) {
      await screen.findByDisplayValue('Book appointment');
      await user.click(screen.getByRole('link', { name: 'All tasks' }));
    }
    expect(await screen.findByRole('searchbox', { name: 'Search tasks' })).toHaveValue(
      'appointment',
    );
    expect(screen.getByRole('tab', { name: /Done/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the intended list when switching between registration and sign-in', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue(session);
    const { user } = openApp('/tasks?status=completed&q=appointment', false);
    await user.click(screen.getByRole('link', { name: 'Create an account' }));
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    await signIn(user);
    expect(await screen.findByRole('searchbox', { name: 'Search tasks' })).toHaveValue(
      'appointment',
    );
    expect(screen.getByRole('tab', { name: /Done/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('protects task routes and returns to a task after signing in', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue(session);
    const { user } = openApp('/tasks/one', false);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await signIn(user);
    expect(await screen.findByDisplayValue('Task one')).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledWith({
      email: session.user.email,
      password: 'correct-horse',
    });
  });
  it('shows incorrect credentials and allows another attempt', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(
      new ApiError(401, 'UNAUTHORIZED', 'Invalid email or password'),
    );
    const { user } = openApp('/login', false);
    await signIn(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
  it('registers a new user', async () => {
    vi.spyOn(authApi, 'register').mockResolvedValue(session);
    const { user } = openApp('/login', false);
    await user.click(screen.getByRole('link', { name: 'Create an account' }));
    await user.type(screen.getByLabelText('Your name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Email address'), session.user.email);
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
    expect(authApi.register).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: session.user.email,
      password: 'correct-horse',
    });
  });
  it('shows field errors from registration and clears them on navigation', async () => {
    vi.spyOn(authApi, 'register').mockRejectedValue(
      new ApiError(
        400,
        'INVALID',
        'Invalid request',
        ['name', 'email', 'password'].map((path) => ({ path, message: `Fix ${path}` })),
      ),
    );
    const { user } = openApp('/register', false);
    await user.type(screen.getByLabelText('Your name'), 'Ada');
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Fix name')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(screen.queryByText('Fix password')).not.toBeInTheDocument();
  });
  it('handles unexpected authentication failures', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue('unavailable');
    const { user } = openApp('/login', false);
    await signIn(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to sign in');
  });
  it('redirects authenticated visitors and clears task data on sign-out', async () => {
    const { user, queryClient } = openApp('/login');
    await screen.findByText('Task one');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(sessionStore.get()).toBeNull();
    expect(screen.queryByText('Task one')).not.toBeInTheDocument();
  });
});

describe('task list', () => {
  it.each(['back', 'save', 'delete', 'header', 'browser back'])(
    'preserves search and status after returning from details via %s',
    async (action) => {
      const { user, router } = openApp('/tasks?status=completed&q=appointment');
      await user.click(await screen.findByRole('link', { name: 'Book appointment' }));
      await screen.findByDisplayValue('Book appointment');
      expect(router.state.location.search).toBe('?status=completed&q=appointment');
      if (action === 'save') {
        await user.type(screen.getByLabelText('Notes'), 'Call first');
        await user.click(screen.getByRole('button', { name: 'Save changes' }));
      } else if (action === 'delete') {
        await user.click(screen.getByRole('button', { name: 'Delete Book appointment' }));
        await user.click(screen.getByRole('button', { name: 'Confirm delete Book appointment' }));
      } else if (action === 'browser back') {
        await act(() => router.navigate(-1));
      } else {
        await user.click(
          screen.getByRole('link', { name: action === 'header' ? 'Todo list' : 'All tasks' }),
        );
      }
      await screen.findByRole('heading', { name: 'Tasks' });
      expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('appointment');
      expect(screen.getByRole('tab', { name: /Done/ })).toHaveAttribute('aria-selected', 'true');
      expect(router.state.location.search).toBe('?status=completed&q=appointment');
    },
  );

  it.each(['/tasks?q=appointment', '/tasks?status=completed'])(
    'confirms hidden quick additions and links to the created task at %s',
    async (path) => {
      const { user } = openApp(path);
      await screen.findByText('Book appointment');
      await user.type(screen.getByRole('textbox', { name: 'New task title' }), 'Buy milk');
      await user.click(screen.getByRole('button', { name: 'Add' }));
      expect(
        await screen.findByText('Task added. Hidden by your current search or filter.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Buy milk' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('link', { name: 'View task' }));
      expect(await screen.findByDisplayValue('Buy milk')).toBeInTheDocument();
      expect(
        screen.queryByText('Task added. Hidden by your current search or filter.'),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole('link', { name: 'All tasks' }));
      await screen.findByRole('heading', { name: 'Tasks' });
      expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue(
        path.includes('q=') ? 'appointment' : '',
      );
    },
  );

  it('does not warn when a new task matches the current search and filter', async () => {
    const { user } = openApp('/tasks?status=active&q=MILK');
    await screen.findByText('No matching tasks');
    await user.type(screen.getByRole('textbox', { name: 'New task title' }), 'Buy milk');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByRole('link', { name: /Buy milk/ });
    expect(
      screen.queryByText('Task added. Hidden by your current search or filter.'),
    ).not.toBeInTheDocument();
  });

  it('allows dismissing a hidden-task confirmation', async () => {
    const { user } = openApp('/tasks?status=completed');
    await screen.findByText('Book appointment');
    await user.type(screen.getByRole('textbox', { name: 'New task title' }), 'Buy milk');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('link', { name: 'View task' })).not.toBeInTheDocument();
  });

  it('uses the current filters when an in-flight quick addition finishes', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const create = vi.mocked(tasksApi.create).getMockImplementation()!;
    vi.mocked(tasksApi.create).mockImplementation(async (values) => {
      await gate;
      return create(values);
    });
    const { user } = openApp();
    await screen.findByText('Task one');
    await user.type(screen.getByRole('textbox', { name: 'New task title' }), 'Buy milk');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('tab', { name: /Done/ }));
    await act(async () => {
      finish();
      await gate;
    });
    expect(await screen.findByRole('link', { name: 'View task' })).toHaveAttribute(
      'href',
      '/tasks/created?status=completed',
    );
    expect(screen.queryByRole('link', { name: /Buy milk/ })).not.toBeInTheDocument();
  });

  it('clears the search when returning to the full list', async () => {
    const { user } = openApp('/tasks?q=appointment');
    await screen.findByText('Book appointment');
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('appointment');
    expect(screen.queryByText('Task one')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Todo list' }));
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('');
    expect(await screen.findByText('Task one')).toBeInTheDocument();
  });
  it('creates, completes, searches, filters and deletes tasks', async () => {
    const { user } = openApp();
    await screen.findByText('Task one');
    await user.type(screen.getByRole('textbox', { name: 'New task title' }), '  Buy milk  ');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Buy milk')).toBeInTheDocument();
    expect(tasksApi.create).toHaveBeenCalledWith({ title: 'Buy milk' });
    expect(screen.getByRole('textbox', { name: 'New task title' })).toHaveValue('');
    await user.click(screen.getByRole('checkbox', { name: 'Mark "Buy milk" as done' }));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Mark "Buy milk" as not done' })).toBeChecked(),
    );
    await user.click(screen.getByRole('tab', { name: /Active/ }));
    await waitFor(() => expect(screen.queryByText('Buy milk')).not.toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /Done/ }));
    await screen.findByText('Buy milk');
    await user.click(screen.getByRole('tab', { name: /All/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'milk');
    await waitFor(() => expect(screen.queryByText('Task one')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Delete Buy milk' }));
    expect(tasksApi.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm delete Buy milk' }));
    expect(await screen.findByText('No matching tasks')).toBeInTheDocument();
    expect(tasksApi.remove).toHaveBeenCalledWith('created');
  });
  it('keeps the task and shows a toast when a save fails', async () => {
    vi.mocked(tasksApi.update).mockRejectedValue(new Error('Please try again'));
    const { user } = openApp();
    await screen.findByText('Task one');
    await user.click(screen.getByRole('checkbox', { name: 'Mark "Task one" as done' }));
    expect(await screen.findByText('Please try again')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mark "Task one" as done' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Please try again' }));
    expect(screen.queryByText('Please try again')).not.toBeInTheDocument();
  });
  it('loads tasks again after a request fails', async () => {
    vi.mocked(tasksApi.list).mockRejectedValueOnce(new Error('Server unavailable'));
    const { user } = openApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load your tasks');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Task one')).toBeInTheDocument();
  });
  it.each([false, true])(
    'preserves the cached list on refresh failure (empty: %s) and recovers',
    async (empty) => {
      if (empty) tasks = [];
      const { user, queryClient } = openApp();
      if (empty) await screen.findByText('No tasks yet');
      else await screen.findByText('Task one');
      const list = vi.mocked(tasksApi.list).getMockImplementation()!;
      vi.mocked(tasksApi.list).mockRejectedValue(new Error('Connection interrupted'));
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ['tasks', session.user.id] });
      });
      expect(await screen.findByRole('alert')).toHaveTextContent('Showing the last saved list');
      if (empty) expect(screen.getByText('No tasks yet')).toBeInTheDocument();
      else {
        expect(screen.getByRole('link', { name: /Task one/ })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Mark "Task one" as done' })).toBeDisabled();
      }
      expect(screen.getByText('Task counts unavailable')).toBeInTheDocument();
      vi.mocked(tasksApi.list).mockImplementation(list);
      await user.click(screen.getByRole('button', { name: 'Retry task list' }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(screen.getByText(empty ? '0 active tasks' : '1 active task')).toBeInTheDocument();
      if (!empty)
        expect(screen.getByRole('checkbox', { name: 'Mark "Task one" as done' })).toBeEnabled();
    },
  );

  it('shows unavailable counts when their request fails and retries independently of the filtered list', async () => {
    const list = vi.mocked(tasksApi.list).getMockImplementation()!;
    vi.mocked(tasksApi.list).mockImplementation((filters, options) => {
      if (filters?.status === 'all') return Promise.reject(new Error('Counts unavailable'));
      return list(filters, options);
    });
    const { user } = openApp('/tasks?status=active');
    await screen.findByText('Task one');
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t refresh task counts');
    expect(screen.getByText('Task counts unavailable')).toBeInTheDocument();
    expect(screen.queryByText('0 active tasks')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Count unavailable')).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: 'Mark "Task one" as done' })).toBeEnabled();
    vi.mocked(tasksApi.list).mockImplementation(list);
    await user.click(screen.getByRole('button', { name: 'Retry task counts' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText('1 active task')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /All/ })).toHaveTextContent('All2');
  });

  it('does not display invented zero counts before the count request finishes', async () => {
    const list = vi.mocked(tasksApi.list).getMockImplementation()!;
    vi.mocked(tasksApi.list).mockImplementation((filters, options) =>
      filters?.status === 'all' ? new Promise(() => {}) : list(filters, options),
    );
    openApp('/tasks?status=active');
    await screen.findByText('Task one');
    expect(screen.getByText('Loading task counts…')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Count unavailable')).toHaveLength(3);
    expect(screen.queryByText('0 active tasks')).not.toBeInTheDocument();
  });
  it.each([
    ['/tasks', 'No tasks yet'],
    ['/tasks?status=completed', 'No completed tasks'],
    ['/tasks?status=active', 'No active tasks'],
  ])('explains the empty state at %s', async (path, heading) => {
    tasks = [];
    openApp(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });
  it('shows a loading state while the API is pending', () => {
    vi.mocked(tasksApi.list).mockReturnValue(new Promise(() => {}));
    openApp();
    expect(screen.getByText('Loading your tasks…')).toBeInTheDocument();
  });
});

describe('task details', () => {
  it.each([
    ['completed', '', false, 'Task added. Hidden by your current search or filter.'],
    ['active', '', true, 'Task added. Hidden by your current search or filter.'],
    ['all', 'map', false, null],
  ])('keeps list settings when creating a task (%s, %s)', async (status, q, completed, message) => {
    const { user, router } = openApp(`/tasks?status=${status}&q=${q}`);
    await user.click(screen.getByRole('link', { name: 'New task' }));
    await user.type(screen.getByLabelText('Title'), 'Plan trip');
    await user.type(screen.getByLabelText('Notes'), 'Bring a map');
    if (completed) await user.click(screen.getByRole('checkbox', { name: 'Completed' }));
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    await screen.findByRole('heading', { name: 'Tasks' });
    expect(router.state.location.search).toBe(`?status=${status}&q=${q}`);
    if (message) expect(screen.getByText(message)).toBeInTheDocument();
    else {
      expect(await screen.findByRole('link', { name: /Plan trip/ })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'View task' })).not.toBeInTheDocument();
    }
  });
  it('creates a task with notes and completion status', async () => {
    const { user } = openApp('/tasks/new');
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required');
    await user.type(screen.getByLabelText('Title'), 'Plan trip');
    await user.type(screen.getByLabelText('Notes'), '  Bring a map  ');
    await user.click(screen.getByRole('checkbox', { name: 'Completed' }));
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() =>
      expect(tasksApi.create).toHaveBeenCalledWith({
        title: 'Plan trip',
        description: 'Bring a map',
        completed: true,
      }),
    );
    expect(await screen.findByText('Plan trip')).toBeInTheDocument();
  });
  it('edits an existing task and clears its notes', async () => {
    const { user } = openApp('/tasks/one');
    expect(screen.getByText('Loading task…')).toBeInTheDocument();
    await screen.findByDisplayValue('Task one');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Revised title');
    await user.clear(screen.getByLabelText('Notes'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Revised title')).toBeInTheDocument();
    expect(tasksApi.update).toHaveBeenCalledWith('one', {
      title: 'Revised title',
      description: '',
      version: 1,
    });
  });
  it('deletes from the detail screen after confirmation', async () => {
    const { user } = openApp('/tasks/one');
    await screen.findByDisplayValue('Task one');
    await user.click(screen.getByRole('button', { name: 'Delete Task one' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete Task one' }));
    await screen.findByRole('heading', { name: 'Tasks' });
    expect(screen.queryByText('Task one')).not.toBeInTheDocument();
  });
  it('shows validation errors without losing the entered title', async () => {
    vi.mocked(tasksApi.create).mockRejectedValue(
      new ApiError(400, 'INVALID', 'Invalid request', [
        { path: 'title', message: 'Use a shorter title' },
      ]),
    );
    const { user } = openApp('/tasks/new');
    await user.type(screen.getByLabelText('Title'), 'Keep my work');
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByText('Use a shorter title')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Keep my work');
  });
  it('shows a missing task message and a route back', async () => {
    const { user } = openApp('/tasks/missing');
    expect(await screen.findByRole('heading', { name: 'Task not found' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'All tasks' }));
    expect(await screen.findByText('Task one')).toBeInTheDocument();
  });
  it('retries a detail request after a server failure', async () => {
    vi.mocked(tasksApi.get).mockRejectedValueOnce(new Error('Server unavailable'));
    const { user } = openApp('/tasks/one');
    expect(
      await screen.findByRole('heading', { name: 'Couldn’t load this task' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByDisplayValue('Task one')).toBeInTheDocument();
  });
  it('isolates caches between accounts', async () => {
    const { queryClient } = openApp();
    await screen.findByText('Task one');
    tasks = [task('private', { title: 'Another user’s task' })];
    act(() =>
      sessionStore.set({
        ...session,
        user: { ...session.user, id: 'user-2', name: 'Grace Hopper' },
      }),
    );
    expect(screen.queryByText('Task one')).not.toBeInTheDocument();
    expect(await screen.findByText('Another user’s task')).toBeInTheDocument();
    expect(screen.queryByText('Task one')).not.toBeInTheDocument();
    expect(queryClient.getQueryCache().findAll({ queryKey: ['tasks', 'user-2'] })).not.toHaveLength(
      0,
    );
  });
});

describe('editing across refreshes and tabs', () => {
  it('preserves a draft through a failed background refresh and retry', async () => {
    const { user, queryClient } = openApp('/tasks/one');
    await screen.findByDisplayValue('Task one');
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Unsaved draft');
    vi.mocked(tasksApi.get).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Offline'));
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ['tasks', session.user.id, 'detail', 'one'],
      });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Your draft is still here');
    expect(screen.getByLabelText('Title')).toHaveValue('Unsaved draft');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Title')).toHaveValue('Unsaved draft');
  });

  it('submits only edited fields with the version originally opened', async () => {
    const { user, queryClient } = openApp('/tasks/one');
    await screen.findByDisplayValue('Task one');
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Revised title');
    tasks = tasks.map((item) =>
      item.id === 'one' ? { ...item, description: 'Notes from another tab', version: 2 } : item,
    );
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ['tasks', session.user.id, 'detail', 'one'],
      });
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(tasksApi.update).toHaveBeenCalledWith('one', { title: 'Revised title', version: 1 }),
    );
    expect(tasks.find((item) => item.id === 'one')?.description).toBe('Notes from another tab');
  });

  it('clears private tasks when another tab signs out', async () => {
    const { queryClient } = openApp();
    await screen.findByText('Task one');
    await act(async () => {
      localStorage.removeItem('momentum.session');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'momentum.session',
          newValue: null,
          storageArea: localStorage,
        }),
      );
    });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('Task one')).not.toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

it('resolves an edit conflict only after explicitly discarding the draft', async () => {
  const { user } = openApp('/tasks/one');
  await screen.findByDisplayValue('Task one');
  await user.clear(screen.getByLabelText('Title'));
  await user.type(screen.getByLabelText('Title'), 'My draft');
  tasks = tasks.map((item) =>
    item.id === 'one'
      ? { ...item, title: 'New server title', description: 'New server notes', version: 2 }
      : item,
  );
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByRole('button', { name: 'Discard draft and load latest' });
  expect(screen.getByLabelText('Title')).toHaveValue('My draft');
  expect(tasks.find((item) => item.id === 'one')?.title).toBe('New server title');
  await user.click(screen.getByRole('button', { name: 'Discard draft and load latest' }));
  await screen.findByDisplayValue('New server title');
  expect(screen.getByLabelText('Notes')).toHaveValue('New server notes');
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await user.clear(screen.getByLabelText('Title'));
  await user.type(screen.getByLabelText('Title'), 'Reviewed title');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Reviewed title');
  expect(tasksApi.update).toHaveBeenLastCalledWith('one', { title: 'Reviewed title', version: 2 });
  expect(tasks.find((item) => item.id === 'one')?.description).toBe('New server notes');
});

it('keeps the draft if loading the latest task after a conflict fails', async () => {
  const { user, queryClient } = openApp('/tasks/one');
  await screen.findByDisplayValue('Task one');
  await user.type(screen.getByLabelText('Title'), ' draft');
  tasks = tasks.map((item) => (item.id === 'one' ? { ...item, version: 2 } : item));
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: ['tasks', session.user.id, 'detail', 'one'] });
  });
  const reload = await screen.findByRole('button', { name: 'Discard draft and load latest' });
  vi.mocked(tasksApi.get).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Offline'));
  await user.click(reload);
  await screen.findByText('Couldn’t refresh this task. Your draft is still here.');
  expect(screen.getByLabelText('Title')).toHaveValue('Task one draft');
  expect(reload).toBeEnabled();
});

it('does not send an empty patch for whitespace-only edits', async () => {
  const { user } = openApp('/tasks/one');
  await screen.findByDisplayValue('Task one');
  await user.type(screen.getByLabelText('Title'), '  ');
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await user.click(screen.getByLabelText('Title'));
  await user.keyboard('{Enter}');
  expect(tasksApi.update).not.toHaveBeenCalled();
});

it.each(['/tasks/new', '/tasks/one'])(
  'locks task fields until the save finishes at %s',
  async (path) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const create = vi.mocked(tasksApi.create).getMockImplementation()!;
    const update = vi.mocked(tasksApi.update).getMockImplementation()!;
    vi.mocked(tasksApi.create).mockImplementation(async (values) => {
      await gate;
      return create(values);
    });
    vi.mocked(tasksApi.update).mockImplementation(async (id, patch) => {
      await gate;
      return update(id, patch);
    });
    const { user } = openApp(path);
    const title = await screen.findByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Submitted title');
    await user.click(
      screen.getByRole('button', { name: path === '/tasks/new' ? 'Create task' : 'Save changes' }),
    );
    try {
      expect(title).toBeDisabled();
      expect(screen.getByLabelText('Notes')).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: 'Completed' })).toBeDisabled();
      await user.type(title, ' extra typing');
      expect(title).toHaveValue('Submitted title');
    } finally {
      await act(async () => release());
    }
    await screen.findByText('Submitted title');
  },
);

it('locks quick add until the pending task is saved', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const create = vi.mocked(tasksApi.create).getMockImplementation()!;
  vi.mocked(tasksApi.create).mockImplementation(async (values) => {
    await gate;
    return create(values);
  });
  const { user } = openApp();
  await screen.findByText('Task one');
  const input = screen.getByRole('textbox', { name: 'New task title' });
  await user.type(input, 'First task');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  try {
    expect(input).toBeDisabled();
    await user.type(input, ' second draft');
    expect(input).toHaveValue('First task');
  } finally {
    await act(async () => release());
  }
  await screen.findByText('First task');
  expect(input).toBeEnabled();
  expect(input).toHaveValue('');
});

it.each(['/tasks/new', '/tasks/one', '/tasks'])(
  'restores editable input and preserves it after a failed save at %s',
  async (path) => {
    let fail!: (error: Error) => void;
    const gate = new Promise<never>((_resolve, reject) => {
      fail = reject;
    });
    vi.mocked(tasksApi.create).mockImplementation(() => gate);
    vi.mocked(tasksApi.update).mockImplementation(() => gate);
    const { user } = openApp(path);
    const input =
      path === '/tasks'
        ? screen.getByRole('textbox', { name: 'New task title' })
        : await screen.findByLabelText('Title');
    await user.clear(input);
    await user.type(input, 'Keep this draft');
    const button =
      path === '/tasks' ? 'Add' : path === '/tasks/new' ? 'Create task' : 'Save changes';
    await user.click(screen.getByRole('button', { name: button }));
    await act(async () => fail(new Error('Save failed')));
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue('Keep this draft');
    expect(screen.getByRole('button', { name: button })).toBeEnabled();
  },
);

it('preserves a draft but disables writes after a task is deleted elsewhere', async () => {
  const { user, queryClient } = openApp('/tasks/one');
  await screen.findByDisplayValue('Task one');
  await user.type(screen.getByLabelText('Title'), ' draft');
  vi.mocked(tasksApi.get).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Task not found'));
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: ['tasks', session.user.id, 'detail', 'one'] });
  });
  expect(await screen.findByRole('heading', { name: 'Task deleted' })).toBeInTheDocument();
  expect(screen.getByLabelText('Title')).toHaveValue('Task one draft');
  expect(screen.getByLabelText('Title')).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Notes')).toHaveAttribute('readonly');
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Delete Task one' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('You can still copy your draft');
});

it('keeps a draft when navigation is canceled and discards it only after confirmation', async () => {
  const { user } = openApp('/tasks/one');
  await screen.findByDisplayValue('Task one');
  await user.type(screen.getByLabelText('Title'), ' draft');
  await user.click(screen.getByRole('link', { name: 'All tasks' }));
  const prompt = await screen.findByRole('dialog', { name: 'Unsaved changes' });
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(prompt).not.toBeInTheDocument();
  expect(screen.getByLabelText('Title')).toHaveValue('Task one draft');
  await user.click(screen.getByRole('link', { name: 'All tasks' }));
  await user.click(await screen.findByRole('button', { name: 'Discard changes and leave' }));
  expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
  expect(tasksApi.update).not.toHaveBeenCalled();
});

it('blocks browser Back for a new draft and supports canceling with Escape', async () => {
  const { user, router } = openApp();
  await screen.findByText('Task one');
  await user.click(screen.getByRole('link', { name: 'New task' }));
  await user.type(screen.getByLabelText('Notes'), 'Draft without a title yet');
  await act(async () => {
    await router.navigate(-1);
  });
  const prompt = await screen.findByRole('dialog', { name: 'Unsaved changes' });
  fireEvent(prompt, new Event('cancel', { cancelable: true, bubbles: true }));
  await waitFor(() => expect(prompt).not.toBeInTheDocument());
  expect(screen.getByLabelText('Notes')).toHaveValue('Draft without a title yet');
  await act(async () => {
    await router.navigate(-1);
  });
  await user.click(await screen.findByRole('button', { name: 'Discard changes and leave' }));
  expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
});

it('warns on refresh only while a form has unsaved changes', async () => {
  const { user } = openApp('/tasks/one');
  await screen.findByDisplayValue('Task one');
  const refresh = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(refresh()).toBe(false);
  await user.type(screen.getByLabelText('Title'), ' draft');
  expect(refresh()).toBe(true);
  await user.clear(screen.getByLabelText('Title'));
  await user.type(screen.getByLabelText('Title'), 'Task one');
  expect(refresh()).toBe(false);
  await user.click(screen.getByRole('link', { name: 'All tasks' }));
  expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('lets sign-out leave a dirty form without exposing its draft', async () => {
  const { user } = openApp('/tasks/one');
  await screen.findByDisplayValue('Task one');
  await user.type(screen.getByLabelText('Title'), ' private draft');
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue('Task one private draft')).not.toBeInTheDocument();
});

it.each(['update', 'remove'] as const)(
  'recognizes deletion from a failed %s request and keeps the draft readable',
  async (operation) => {
    const { user } = openApp('/tasks/one');
    await screen.findByDisplayValue('Task one');
    await user.type(screen.getByLabelText('Title'), ' draft');
    vi.mocked(tasksApi[operation]).mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'Task not found'),
    );
    vi.mocked(tasksApi.get).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Task not found'));
    if (operation === 'update') {
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
    } else {
      await user.click(screen.getByRole('button', { name: 'Delete Task one' }));
      await user.click(screen.getByRole('button', { name: 'Confirm delete Task one' }));
    }
    expect(await screen.findByRole('heading', { name: 'Task deleted' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Task one draft');
    expect(screen.getByLabelText('Title')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  },
);

it('allows confirmed deletion to leave a dirty editor without a second prompt', async () => {
  const { user } = openApp('/tasks/one');
  await screen.findByDisplayValue('Task one');
  await user.type(screen.getByLabelText('Title'), ' draft');
  await user.click(screen.getByRole('button', { name: 'Delete Task one' }));
  await user.click(screen.getByRole('button', { name: 'Confirm delete Task one' }));
  expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
