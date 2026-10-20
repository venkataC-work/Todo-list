import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const password = 'correct-horse-2026';
const register = async (page: Page) => {
  const email = `test-${randomUUID()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Test User');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
  return email;
};
const addTask = async (page: Page, title: string) => {
  await page.getByRole('textbox', { name: 'New task title' }).fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
};
const checkWidth = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
};

test('a delayed sign-in cannot replace the account selected in another tab', async ({
  page,
  context,
}) => {
  const firstEmail = await register(page);
  await addTask(page, 'Account A private task');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  const secondEmail = await register(page);
  await addTask(page, 'Account B private task');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  const slowPage = await context.newPage();
  let release!: () => void;
  let responseReady!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    responseReady = resolve;
  });
  try {
    await slowPage.route('**/api/auth/login', async (route) => {
      const response = await route.fetch();
      responseReady();
      await gate;
      await route.fulfill({ response });
    });
    await slowPage.goto('/login');
    await slowPage.getByLabel('Email address').fill(firstEmail);
    await slowPage.getByLabel('Password', { exact: true }).fill(password);
    await slowPage.getByRole('button', { name: 'Sign in' }).click();
    await ready;
    await page.getByLabel('Email address').fill(secondEmail);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(
      page.getByRole('link', { name: 'Account B private task', exact: true }),
    ).toBeVisible();
    await expect(
      slowPage.getByRole('link', { name: 'Account B private task', exact: true }),
    ).toBeVisible();
    const finished = slowPage.waitForEvent('requestfinished', {
      predicate: (request) => request.url().endsWith('/api/auth/login'),
    });
    release();
    await finished;
    expect(
      await slowPage.evaluate(
        () => JSON.parse(localStorage.getItem('momentum.session') ?? 'null')?.user.email,
      ),
    ).toBe(secondEmail);
    await expect(
      slowPage.getByRole('link', { name: 'Account B private task', exact: true }),
    ).toBeVisible();
    await expect(
      slowPage.getByRole('link', { name: 'Account A private task', exact: true }),
    ).toHaveCount(0);
  } finally {
    release();
    await slowPage.close();
  }
});

test('keeps cached tasks through refresh errors and recovers unavailable counts', async ({
  page,
}) => {
  await register(page);
  await addTask(page, 'Pay invoice');
  await addTask(page, 'Read chapter');
  let failFullList = true;
  await page.route('**/api/tasks*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      failFullList &&
      request.method() === 'GET' &&
      url.pathname === '/api/tasks' &&
      !url.search
    ) {
      await route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: 'Please try again' } },
      });
    } else await route.continue();
  });
  await page.getByRole('checkbox', { name: 'Mark "Pay invoice" as done' }).click();
  await expect(
    page.getByText('Couldn’t refresh your tasks. Showing the last saved list.'),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('link', { name: 'Read chapter', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Mark "Pay invoice" as done' })).toBeDisabled();
  failFullList = false;
  await page.getByRole('button', { name: 'Retry task list' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Mark "Pay invoice" as not done' }),
  ).toBeChecked();
  await expect(page.getByRole('button', { name: 'Retry task list' })).toHaveCount(0);
  await page.getByRole('tab', { name: /Active/ }).click();
  await expect(page.getByRole('tab', { name: /Active/ })).toHaveAttribute('aria-selected', 'true');
  failFullList = true;
  await page.reload();
  await expect(page.getByText('Task counts unavailable')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('link', { name: 'Read chapter', exact: true })).toBeVisible();
  await expect(page.getByLabel('Count unavailable', { exact: true })).toHaveCount(3);
  failFullList = false;
  await page.getByRole('button', { name: 'Retry task counts' }).click();
  await expect(page.getByText('1 active task', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry task counts' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /All/ })).toHaveText('All2');
  await checkWidth(page);
});

test('restores search and filter settings after signing in to a protected task URL', async ({
  page,
}) => {
  const email = await register(page);
  await addTask(page, 'Pay invoice');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.goto('/tasks?status=active&q=invoice');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/tasks\?status=active&q=invoice$/);
  await expect(page.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('invoice');
  await expect(page.getByRole('tab', { name: /Active/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('link', { name: 'Pay invoice', exact: true })).toBeVisible();
});

test('keeps search and status when viewing, saving and returning from tasks', async ({ page }) => {
  await register(page);
  await addTask(page, 'Pay invoice');
  await addTask(page, 'Read chapter');
  await page.getByRole('tab', { name: /Active/ }).click();
  await page.getByRole('searchbox', { name: 'Search tasks' }).fill('invoice');
  await expect(page.getByRole('link', { name: 'Read chapter', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Pay invoice', exact: true }).click();
  await page.reload();
  await page.getByLabel('Notes').fill('Due Friday');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('invoice');
  await expect(page.getByRole('tab', { name: /Active/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('link', { name: /Pay invoice/ }).click();
  await page.getByRole('link', { name: 'All tasks' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('invoice');
  await expect(page.getByRole('tab', { name: /Active/ })).toHaveAttribute('aria-selected', 'true');
});

test('explains hidden creations and lets the user open them without losing filters', async ({
  page,
}) => {
  await register(page);
  await page.getByRole('tab', { name: /Done/ }).click();
  await page.getByRole('searchbox', { name: 'Search tasks' }).fill('invoice');
  await page.getByRole('textbox', { name: 'New task title' }).fill('Book train tickets');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(
    page.getByText('Task added. Hidden by your current search or filter.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'View task' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Book train tickets');
  await page.getByRole('link', { name: 'All tasks' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('invoice');
  await page.getByRole('link', { name: 'New task', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Send invoice');
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
  await expect(
    page.getByText('Task added. Hidden by your current search or filter.'),
  ).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('invoice');
  await expect(page.getByRole('tab', { name: /Done/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('link', { name: 'View task' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Send invoice');
  await page.getByRole('link', { name: 'All tasks' }).click();
  await page.getByRole('tab', { name: /All/ }).click();
  await page.getByRole('searchbox', { name: 'Search tasks' }).clear();
  await expect(page.getByRole('link', { name: 'Book train tickets', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Send invoice', exact: true })).toBeVisible();
  await checkWidth(page);
});

test('registers, creates, edits, reorders, searches and deletes tasks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = await register(page);
  await checkWidth(page);
  await page.getByRole('link', { name: 'New task', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Plan the trip');
  await page.getByLabel('Notes').fill('Bring a map and book the train.');
  await checkWidth(page);
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByText('Plan the trip', { exact: true })).toBeVisible();
  await addTask(page, 'Read a chapter');
  await page.getByRole('link', { name: /Plan the trip/ }).click();
  await page.getByLabel('Title', { exact: true }).fill('Book the train');
  await page.getByRole('button', { name: 'Save changes' }).click();
  const list = page.getByRole('list', { name: 'Tasks', exact: true });
  await expect(list.getByRole('listitem').first()).toContainText('Read a chapter');
  const targetId = (await page.getByRole('link', { name: /Book the train/ }).getAttribute('href'))
    ?.split('/')
    .pop();
  const handle = page.getByRole('button', { name: 'Reorder Read a chapter', exact: true });
  const sourceId = (await page.getByRole('link', { name: /Read a chapter/ }).getAttribute('href'))
    ?.split('/')
    .pop();
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.locator('[role="status"]').filter({ hasText: `droppable area ${sourceId}` }),
  ).toBeAttached();
  // The keyboard sensor installs its listener in a zero-delay timer after pickup.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  await page.keyboard.press('ArrowDown');
  await expect(
    page.locator('[role="status"]').filter({ hasText: `droppable area ${targetId}` }),
  ).toBeAttached();
  await page.keyboard.press('Space');
  await expect(list.getByRole('listitem').first()).toContainText('Book the train');
  await page.reload();
  await expect(list.getByRole('listitem').first()).toContainText('Book the train');
  await page.getByRole('checkbox', { name: 'Mark "Book the train" as done' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Mark "Book the train" as not done' }),
  ).toBeChecked();
  await page.getByRole('tab', { name: /Done/ }).click();
  await expect(page.getByText('Read a chapter', { exact: true })).toBeHidden();
  await page.getByRole('tab', { name: /All/ }).click();
  await page.getByRole('searchbox', { name: 'Search tasks' }).fill('train');
  await expect(page.getByText('Read a chapter', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Delete Book the train', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete Book the train', exact: true }).click();
  await expect(page.getByText('No matching tasks')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('train');
  await page.getByRole('searchbox', { name: 'Search tasks' }).clear();
  await expect(page.getByText('Read a chapter', { exact: true })).toBeVisible();
  await expect(page.getByText('Book the train', { exact: true })).toBeHidden();
  await checkWidth(page);
  expect(errors).toEqual([]);
});

test('keeps users’ tasks separate and rejects incorrect passwords', async ({ page }) => {
  const email = await register(page);
  await addTask(page, 'A private task');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid email or password');
  await register(page);
  await expect(page.getByText('No tasks yet', { exact: true })).toBeVisible();
  await expect(page.getByText('A private task', { exact: true })).toBeHidden();
});

test('returns an invalid session to sign-in and handles a missing task', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() =>
    localStorage.setItem(
      'momentum.session',
      JSON.stringify({
        token: 'expired-token',
        user: {
          id: 'missing',
          name: 'Expired User',
          email: 'old@example.com',
          createdAt: '2026-01-01',
        },
      }),
    ),
  );
  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await register(page);
  await page.goto('/tasks/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Task not found' })).toBeVisible();
  await page.getByRole('link', { name: 'All tasks' }).click();
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
});

test('dragging a filtered list keeps hidden tasks in place', async ({ page }) => {
  await register(page);
  await addTask(page, 'First task');
  await addTask(page, 'Middle task');
  await addTask(page, 'Last task');
  await page.getByRole('checkbox', { name: 'Mark "Middle task" as done' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Mark "Middle task" as not done' }),
  ).toBeChecked();
  await page.getByRole('tab', { name: /Active/ }).click();
  await expect(page.getByText('Middle task', { exact: true })).toBeHidden();
  const source = await page
    .getByRole('button', { name: 'Reorder Last task', exact: true })
    .boundingBox();
  const target = await page.getByRole('link', { name: /First task/ }).boundingBox();
  if (!source || !target) throw new Error('Task drag targets should be visible');
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
  const items = page.getByRole('list', { name: 'Tasks', exact: true }).getByRole('listitem');
  await expect(items.first()).toContainText('First task');
  await page.reload();
  await expect(items.first()).toContainText('First task');
  await page.getByRole('tab', { name: /All/ }).click();
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('First task');
  await expect(items.nth(1)).toContainText('Middle task');
  await expect(items.nth(2)).toContainText('Last task');
});

test('protects edits in two tabs and signs both tabs out together', async ({ page, context }) => {
  await register(page);
  await addTask(page, 'Shared task');
  const other = await context.newPage();
  await other.goto('/tasks');
  await other.getByRole('link', { name: /Shared task/ }).click();
  await page.getByRole('link', { name: /Shared task/ }).click();
  await page.getByLabel('Title', { exact: true }).fill('My unsaved title');
  await other.getByLabel('Notes').fill('Notes saved from the second tab');
  await other.getByRole('button', { name: 'Save changes' }).click();
  await expect(other.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('button', { name: 'Discard draft and load latest' })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My unsaved title');
  await page.getByRole('button', { name: 'Discard draft and load latest' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Shared task');
  await expect(page.getByLabel('Notes')).toHaveValue('Notes saved from the second tab');
  await page.getByLabel('Title', { exact: true }).fill('Reviewed task');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Reviewed task', { exact: true })).toBeVisible();

  await other.reload();
  await other.getByRole('link', { name: /Reviewed task/ }).click();
  await expect(other.getByLabel('Notes')).toHaveValue('Notes saved from the second tab');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(other.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await register(page);
  await expect(other.getByRole('heading', { name: 'Task not found' })).toBeVisible();
  await other.getByRole('link', { name: 'All tasks' }).click();
  await expect(other.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
  await expect(other.getByText('No tasks yet', { exact: true })).toBeVisible();
  await expect(other.getByText('Reviewed task', { exact: true })).toBeHidden();
  await other.close();
});

test('protects unsaved drafts on links and browser Back', async ({ page }) => {
  await register(page);
  await addTask(page, 'Task to edit');
  await page.getByRole('link', { name: /Task to edit/ }).click();
  await page.getByLabel('Notes').fill('Keep this unsaved draft');
  await page.getByRole('link', { name: 'All tasks' }).click();
  const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Notes')).toHaveValue('Keep this unsaved draft');

  await page.evaluate(() => history.back());
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Notes')).toHaveValue('Keep this unsaved draft');
  await page.getByRole('link', { name: 'All tasks' }).click();
  await page.getByRole('button', { name: 'Discard changes and leave' }).click();
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Task to edit/ }).click();
  await expect(page.getByLabel('Notes')).toHaveValue('');
  await page.getByRole('link', { name: 'All tasks' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('link', { name: 'New task', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Save without a warning');
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByText('Save without a warning', { exact: true })).toBeVisible();
  await expect(dialog).toBeHidden();
  await checkWidth(page);
});

test('preserves a deleted-task draft while disabling save and delete', async ({
  page,
  context,
}) => {
  await register(page);
  await addTask(page, 'Task removed elsewhere');
  await page.getByRole('link', { name: /Task removed elsewhere/ }).click();
  await page.getByLabel('Title', { exact: true }).fill('A draft worth keeping');
  await page.getByLabel('Notes').fill('Copy these notes before leaving.');
  const other = await context.newPage();
  await other.goto('/tasks');
  await other.getByRole('button', { name: 'Delete Task removed elsewhere', exact: true }).click();
  await other
    .getByRole('button', { name: 'Confirm delete Task removed elsewhere', exact: true })
    .click();
  await expect(other.getByText('No tasks yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Task deleted' })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('A draft worth keeping');
  await expect(page.getByLabel('Notes')).toHaveValue('Copy these notes before leaving.');
  await expect(page.getByLabel('Title', { exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Delete Task removed elsewhere', exact: true }),
  ).toBeDisabled();
  await page.getByRole('link', { name: 'All tasks' }).click();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Notes')).toHaveValue('Copy these notes before leaving.');
  await page.getByRole('link', { name: 'All tasks' }).click();
  await page.getByRole('button', { name: 'Discard changes and leave' }).click();
  await expect(page.getByText('No tasks yet', { exact: true })).toBeVisible();
  await other.close();
});
