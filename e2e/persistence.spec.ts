import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// A separate process and temporary file keep restart tests away from developer data.
const startFileServer = async (dataFile: string) => {
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { bootstrap } from './server/dist/app/bootstrap.js';
    import { loadConfig } from './server/dist/config/env.js';
    const { app } = await bootstrap(loadConfig());
    const server = app.listen(0, '127.0.0.1', () => {
      process.send({ port: server.address().port });
    });
    process.once('SIGTERM', () => server.close(() => process.exit(0)));
  `,
    ],
    {
      cwd: resolve('.'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: '4000',
        JWT_SECRET: 'file-restart-tests-only-secret-at-least-32-characters',
        TOKEN_TTL_SECONDS: '3600',
        AUTH_RATE_LIMIT: '1000',
        CORS_ORIGINS: '',
        DATA_FILE: dataFile,
        STATIC_DIR: resolve('client/dist'),
      },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    },
  );
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.kill('SIGTERM');
    try {
      await exited;
    } finally {
      clearTimeout(deadline);
    }
  };
  let diagnostics = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    diagnostics += chunk.toString();
  });
  try {
    const messages = await once(child, 'message', { signal: AbortSignal.timeout(10_000) });
    const message: unknown = messages[0];
    if (
      typeof message !== 'object' ||
      message === null ||
      !('port' in message) ||
      typeof message.port !== 'number'
    ) {
      throw new Error('The file-backed API did not report its listening port');
    }
    return { url: `http://127.0.0.1:${message.port}`, stop };
  } catch (error) {
    await stop();
    throw new Error(`Unable to start the file-backed API: ${diagnostics}`, { cause: error });
  }
};

test('preserves accounts, edited tasks, order, completion and deletions across an API restart', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'todo-browser-persistence-'));
  const dataFile = join(directory, 'tasks.json');
  let server: Awaited<ReturnType<typeof startFileServer>> | undefined;
  try {
    server = await startFileServer(dataFile);
    await page.goto(`${server.url}/register`);
    await page.getByLabel('Your name').fill('Persistence User');
    await page.getByLabel('Email address').fill('persist@example.com');
    await page.getByLabel('Password', { exact: true }).fill('persistent-password-2026');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'New task', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Original task');
    await page.getByLabel('Notes').fill('Original notes');
    await page.getByRole('button', { name: 'Create task' }).click();
    await page.getByRole('link', { name: /Original task/ }).click();
    await page.getByLabel('Title', { exact: true }).fill('Saved task');
    await page.getByLabel('Notes').fill('Updated notes survive a restart');
    await page.getByRole('checkbox', { name: 'Completed', exact: true }).check();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved task', { exact: true })).toBeVisible();
    for (const title of ['Second task', 'Delete this task']) {
      await page.getByRole('textbox', { name: 'New task title' }).fill(title);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Delete Delete this task', exact: true }).click();
    await page
      .getByRole('button', { name: 'Confirm delete Delete this task', exact: true })
      .click();
    await expect(page.getByText('Delete this task', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await server.stop();
    server = undefined;
    server = await startFileServer(dataFile);
    await page.goto(`${server.url}/login`);
    await page.getByLabel('Email address').fill('persist@example.com');
    await page.getByLabel('Password', { exact: true }).fill('persistent-password-2026');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const items = page.getByRole('list', { name: 'Tasks', exact: true }).getByRole('listitem');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('Second task');
    await expect(items.nth(1)).toContainText('Saved task');
    await expect(
      page.getByRole('checkbox', { name: 'Mark "Saved task" as not done' }),
    ).toBeChecked();
    await page.getByRole('link', { name: /Saved task/ }).click();
    await expect(page.getByLabel('Notes')).toHaveValue('Updated notes survive a restart');
    await expect(page.getByRole('checkbox', { name: 'Completed', exact: true })).toBeChecked();
    await page.getByLabel('Title', { exact: true }).fill('Edited after restart');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Edited after restart', { exact: true })).toBeVisible();
  } finally {
    try {
      await server?.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});
