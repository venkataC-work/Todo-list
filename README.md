# Todo list

A full-stack app for the To Do List engineering challenge. Create an account, sign in, and manage your own tasks on a desktop or phone.

The app uses React, TypeScript, and a custom Express REST API. Accounts and tasks are saved in a local JSON file. Deployment is optional for the assignment; no live deployment is included.

## Run it on a Mac

Install Node.js 24 and npm. If you use nvm, run `nvm install` and `nvm use` from this folder.

```sh
npm ci
cp .env.example .env
npm run dev
```

If you already have a `.env`, keep it rather than copying over it. Open **http://localhost:5173**, create an account, and add a task. The API runs at **http://localhost:4000**. Press Control-C to stop both services.

The example configuration saves data in `server/data/tasks.json`, which is ignored by Git. Leaving `DATA_FILE` unset uses memory instead, so data is lost when the API stops. Restart the dev command after changing environment settings. Existing files from the earlier version still load; retired priority and due-date fields are ignored.

## Completed features

- Account registration, sign-in, sign-out, and sessions that survive a page refresh.
- Each account can only access its own tasks. Ownership is checked by the API.
- Create, read, edit, and delete tasks from the list and task detail screens.
- Task titles, optional notes, and completion status.
- Search titles and notes; filter by All, Active, or Done.
- Search and filters stay in place when returning from a task. If a new task is hidden by those settings, a confirmation links directly to it.
- Drag tasks to reorder them, with keyboard support and saved order after a refresh.
- Responsive screens, loading and empty states, validation messages, and delete confirmation.
- Failed refreshes keep the last loaded task list visible with a retry option. Unavailable task counts show a dash instead of zero and can be retried separately.
- Drafts survive failed background refreshes. Stale edits are rejected, and sign-in/sign-out updates other open tabs.
- Delayed sign-in or registration responses cannot replace a newer session or undo a sign-out.
- Leaving unsaved edits asks for confirmation. If a task is deleted elsewhere, its draft remains readable for copying and write actions are disabled.

To reorder with a keyboard, focus the task handle and press Space. Move with the arrow keys, then press Space to save or Escape to cancel. Reordering search results keeps hidden tasks in their existing slots.

## Approach and structure

I kept both applications in one repository with npm workspaces. One install sets up the client, API, and shared TypeScript contracts.

```text
client/src/
  app/                   Routes, providers, layout, integration tests
  features/auth/         Account screens and authentication
  features/tasks/        Task screens, components, and queries
  shared/                HTTP client, session storage, reusable controls
  styles/                Shared colors, spacing, and base styles
server/src/
  app/                   Application setup and dependency wiring
  config/                Environment validation
  modules/auth/          Account routes, validation, passwords, tokens
  modules/tasks/         Task routes, validation, business rules
  infrastructure/store/  File storage and serialized updates
  shared/                Errors and HTTP helpers
packages/contracts/      Shared request and response types
e2e/                     Browser tests against the real app
```

Routes handle HTTP, services apply business rules, and the store handles saving. Small pure functions handle filtering and ordering. Tests live beside the code they exercise. Shared code does not depend on feature screens, and services do not depend on Express. ESLint checks these boundaries.

React Query handles requests and caching. Cache keys include the account ID, and signing out clears cached tasks. Writes run in order per account, and the client refreshes data after a successful change. Reads support cancellation and requests have a timeout.

The server hashes passwords with scrypt and a random salt, validates requests with Zod, and signs expiring JWTs. It limits authentication attempts and checks ownership on every task request. The store exposes frozen snapshots with read-only records, so callers cannot change saved state outside the write queue. File updates run one at a time and use an atomic rename. Invalid saved data stops startup rather than being silently replaced.

## Checks and tests

```sh
npm run validate
npx playwright install chromium firefox webkit
npm run test:e2e
```

`validate` runs lint, formatting, TypeScript checks, unit and integration tests with coverage thresholds, and production builds. Browser tests need the build produced by that command. If Google Chrome is installed, you can skip the Chromium download by installing only `firefox webkit` and running `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`.

Tests cover authentication, ownership, CRUD, validation, search, ordering, concurrent writes, storage failures, forms, and session handling. Playwright runs the main flows on desktop Chromium, mobile Chromium, Firefox, and WebKit. Most tests use separate in-memory data. A restart test starts a separate API process with a temporary JSON file and verifies that accounts, edited tasks, completion status, list order, and deletions survive a restart. These tests never use your local task file. Coverage reports go in `client/coverage/` and `server/coverage/`.

Use `npm test` for unit and integration tests alone. Generated builds, reports, local data, and environment files are ignored by Git.

## Production build

```sh
npm run build
STATIC_DIR=../client/dist npm start
```

Open **http://localhost:4000**. Express serves the frontend and API together, including task detail URLs opened directly.

Before hosting, replace `JWT_SECRET` in `.env` with a random secret of at least 32 characters, for example one generated by `openssl rand -hex 32`. Then run:

```sh
NODE_ENV=production STATIC_DIR=../client/dist npm start
```

Production startup rejects missing, short, or default development secrets. Use HTTPS and put `DATA_FILE` on a persistent disk with backups.

## Configuration

API commands load the root `.env`. Shell settings take precedence. Relative API file paths start from `server/`. Vite reads only the development ports from the root file.

| Variable            | Default without `.env` | Purpose                                                 |
| ------------------- | ---------------------- | ------------------------------------------------------- |
| `PORT`              | `4000`                 | API port; also used by the development proxy            |
| `WEB_PORT`          | `5173`                 | Frontend development port                               |
| `DATA_FILE`         | Unset                  | JSON data file; unset means memory only                 |
| `JWT_SECRET`        | Development secret     | Token signing secret; replace before hosting            |
| `TOKEN_TTL_SECONDS` | `43200`                | Session lifetime in seconds                             |
| `AUTH_RATE_LIMIT`   | `20`                   | Sign-in and registration attempts per IP per 15 minutes |
| `CORS_ORIGINS`      | Empty                  | Allowed frontend origins when hosted separately         |
| `STATIC_DIR`        | Unset                  | Built frontend directory for Express to serve           |

For separate hosting, build the client with `VITE_API_URL` set to your API origin and allow the frontend origin in `CORS_ORIGINS`. Origins must use HTTP or HTTPS without paths or credentials.

## API

Requests and responses use JSON. Task routes and `/api/auth/me` require `Authorization: Bearer <token>`.

| Method | Route                             | Purpose                            |
| ------ | --------------------------------- | ---------------------------------- |
| GET    | `/api/health`                     | Health check                       |
| POST   | `/api/auth/register`              | Create an account and session; 201 |
| POST   | `/api/auth/login`                 | Sign in; 200                       |
| GET    | `/api/auth/me`                    | Current account; 200               |
| GET    | `/api/tasks?q=word&status=active` | List or search tasks; 200          |
| POST   | `/api/tasks`                      | Create a task; 201                 |
| GET    | `/api/tasks/:id`                  | Read a task; 200                   |
| PATCH  | `/api/tasks/:id`                  | Update a task; 200                 |
| DELETE | `/api/tasks/:id`                  | Delete a task; 204                 |
| PUT    | `/api/tasks/order`                | Save task order; 200               |

Create a task with `{ "title": "Buy milk" }`. Optional fields are `description` and `completed`. Titles can have up to 200 characters and notes up to 5,000. Updates accept any of these fields and require the task’s current `version`, returned when reading the task. For example, `{ "title": "Buy bread", "version": 1 }`. Each successful edit increments the version; a stale edit returns 409 without changing the task. Existing data files receive version 1 when loaded. Ordering takes `{ "ids": ["second-id", "first-id"] }` with unique IDs belonging to the signed-in account.

Validation errors return 400, missing authentication 401, missing or foreign tasks 404, duplicate accounts or stale task edits 409, and rate limits 429. Errors follow `{ "error": { "code": "…", "message": "…" } }`; validation errors also include field details.

## Limits and next steps

The implementation covers the required app features. The repository is available at [venkataC-work/Todo-list](https://github.com/venkataC-work/Todo-list).

The JSON store supports one API process with a small dataset. It rewrites the file on each change and cannot coordinate multiple instances. Tokens are stored in local storage, so a script injection could read them. Signing out removes the browser session; it does not revoke a token already issued.

With more time, I would add:

| Improvement                                                       | Rough estimate                   |
| ----------------------------------------------------------------- | -------------------------------- |
| Password reset and email verification                             | 1–2 days                         |
| PostgreSQL, migrations, and transaction tests                     | 1–2 days                         |
| HttpOnly cookie sessions, CSRF protection, and session revocation | 1–2 days                         |
| Cloud deployment, shared rate limits, backups, and monitoring     | 2–3 days after the database work |
| Accessibility audit and real-device testing                       | 1 day                            |

For a distributed deployment, I would serve the frontend from object storage through a CDN, run stateless API instances behind a load balancer, and use managed PostgreSQL. This would also need shared rate-limit storage and explicit trusted-proxy settings. That setup is a future improvement, not included infrastructure.

For larger usage, I would add pagination, idempotency keys, and load tests. These estimates depend on the hosting and email services chosen.
