import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../testing/app.js';

type Context = Awaited<ReturnType<typeof buildTestApp>>;
type Session = Awaited<ReturnType<Context['signUp']>>;

describe('tasks API', () => {
  let app: Context['app'];
  let ada: Session;

  const createTask = (body: object, session = ada) =>
    request(app).post('/api/tasks').set(session.headers).send(body).expect(201);

  const titles = async (query = '', session = ada) => {
    const res = await request(app).get(`/api/tasks${query}`).set(session.headers).expect(200);
    return res.body.map(({ title }: { title: string }) => title);
  };

  beforeEach(async () => {
    const context = await buildTestApp();
    app = context.app;
    ada = await context.signUp('ada@example.com');
  });

  it('requires authentication', async () => {
    await request(app).get('/api/tasks').expect(401);
  });

  it('rejects a valid token when its account no longer exists', async () => {
    const context = await buildTestApp();
    const token = context.services.tokens.sign('removed-account');
    await request(context.app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    await request(context.app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Orphan' })
      .expect(401);
  });

  it('prevents changes, deletion, and reordering of another user’s tasks', async () => {
    const context = await buildTestApp();
    const owner = await context.signUp('owner@example.com');
    const other = await context.signUp('other@example.com');
    const { body: task } = await request(context.app)
      .post('/api/tasks')
      .set(owner.headers)
      .send({ title: 'Private' })
      .expect(201);
    await request(context.app)
      .patch(`/api/tasks/${task.id}`)
      .set(other.headers)
      .send({ title: 'Changed', version: 1 })
      .expect(404);
    await request(context.app).delete(`/api/tasks/${task.id}`).set(other.headers).expect(404);
    await request(context.app)
      .put('/api/tasks/order')
      .set(other.headers)
      .send({ ids: [task.id] })
      .expect(400);
    await request(context.app).get(`/api/tasks/${task.id}`).set(owner.headers).expect(200, task);
  });

  it('keeps all tasks when creates overlap', async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => createTask({ title: `Concurrent ${i}` })),
    );
    const { body } = await request(app).get('/api/tasks').set(ada.headers).expect(200);
    expect(body).toHaveLength(8);
    expect(new Set(body.map(({ id }: { id: string }) => id)).size).toBe(8);
    expect(body.map(({ position }: { position: number }) => position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  describe('create', () => {
    it('applies defaults and returns 201', async () => {
      const { body } = await createTask({ title: '  Buy milk  ' });
      expect(body).toEqual({
        id: expect.any(String),
        userId: ada.user.id,
        title: 'Buy milk',
        description: '',
        completed: false,
        position: 0,
        version: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('inserts new tasks at the top of the list', async () => {
      await createTask({ title: 'First' });
      await createTask({ title: 'Second' });
      expect(await titles()).toEqual(['Second', 'First']);
    });

    it.each([
      [{}, 'title'],
      [{ title: '   ' }, 'title'],
      [{ title: 'ok', description: 'x'.repeat(5001) }, 'description'],
      [{ title: 'ok', completed: 'yes' }, 'completed'],
      [{ title: 'ok', userId: 'someone-else' }, ''],
    ])('rejects invalid payload %j with 400', async (body, path) => {
      const res = await request(app).post('/api/tasks').set(ada.headers).send(body).expect(400);
      expect(res.body.error.details[0].path).toBe(path);
    });

    it('rejects malformed JSON with 400', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set(ada.headers)
        .set('Content-Type', 'application/json')
        .send('{"title":')
        .expect(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('read', () => {
    it('lists only the current user’s tasks', async () => {
      const context = await buildTestApp();
      app = context.app;
      ada = await context.signUp('ada@example.com');
      const bob = await context.signUp('bob@example.com');
      await createTask({ title: 'Ada task' });
      await createTask({ title: 'Bob task' }, bob);

      expect(await titles()).toEqual(['Ada task']);
      expect(await titles('', bob)).toEqual(['Bob task']);
    });

    it('searches title and description case-insensitively', async () => {
      await createTask({ title: 'Quarterly report' });
      await createTask({ title: 'Groceries', description: 'Milk for the REPORT meeting' });
      await createTask({ title: 'Gym' });
      expect(await titles('?q=report')).toEqual(['Groceries', 'Quarterly report']);
    });

    it('filters by status', async () => {
      await createTask({ title: 'Open' });
      await createTask({ title: 'Done', completed: true });
      expect(await titles('?status=active')).toEqual(['Open']);
      expect(await titles('?status=completed')).toEqual(['Done']);
      await request(app).get('/api/tasks?status=bogus').set(ada.headers).expect(400);
    });

    it('fetches a single task and 404s for missing or foreign ones', async () => {
      const context = await buildTestApp();
      app = context.app;
      ada = await context.signUp('ada@example.com');
      const bob = await context.signUp('bob@example.com');
      const { body: task } = await createTask({ title: 'Mine' });

      await request(app).get(`/api/tasks/${task.id}`).set(ada.headers).expect(200, task);
      await request(app).get(`/api/tasks/${task.id}`).set(bob.headers).expect(404);
      await request(app).get('/api/tasks/does-not-exist').set(ada.headers).expect(404);
    });
  });

  describe('update', () => {
    it('rejects overlapping edits based on the same version without losing the winner', async () => {
      const { body: task } = await createTask({ title: 'Original' });
      const results = await Promise.all(
        ['First edit', 'Second edit'].map((title) =>
          request(app).patch(`/api/tasks/${task.id}`).set(ada.headers).send({ title, version: 1 }),
        ),
      );
      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
      const winner = results.find((result) => result.status === 200)!;
      const current = await request(app).get(`/api/tasks/${task.id}`).set(ada.headers).expect(200);
      expect(current.body).toEqual(winner.body);
      expect(current.body.version).toBe(2);
    });

    it('patches provided fields and bumps updatedAt', async () => {
      const { body: task } = await createTask({ title: 'Draft' });
      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .set(ada.headers)
        .send({ completed: true, description: 'Ready for review', version: 1 })
        .expect(200);

      expect(res.body).toMatchObject({
        title: 'Draft',
        completed: true,
        description: 'Ready for review',
      });
      expect(res.body.updatedAt >= task.updatedAt).toBe(true);
    });

    it('clears notes with an empty string', async () => {
      const { body: task } = await createTask({ title: 'Draft', description: 'Old notes' });
      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .set(ada.headers)
        .send({ description: '', version: 1 })
        .expect(200);
      expect(res.body.description).toBe('');
    });

    it.each([undefined, 0, -1, 1.5, '1'])(
      'rejects a missing or invalid edit version: %s',
      async (version) => {
        const { body: task } = await createTask({ title: 'Draft' });
        await request(app)
          .patch(`/api/tasks/${task.id}`)
          .set(ada.headers)
          .send({ title: 'Changed', version })
          .expect(400);
      },
    );

    it('accepts a refreshed version after a conflict', async () => {
      const { body: task } = await createTask({ title: 'Draft' });
      const first = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .set(ada.headers)
        .send({ description: 'New notes', version: task.version })
        .expect(200);
      await request(app)
        .patch(`/api/tasks/${task.id}`)
        .set(ada.headers)
        .send({ title: 'Stale', version: task.version })
        .expect(409);
      const final = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .set(ada.headers)
        .send({ title: 'Reviewed', version: first.body.version })
        .expect(200);
      expect(final.body).toMatchObject({ title: 'Reviewed', description: 'New notes', version: 3 });
    });

    it('rejects empty and invalid patches with 400', async () => {
      const { body: task } = await createTask({ title: 'Draft' });
      const patch = (body: object) =>
        request(app)
          .patch(`/api/tasks/${task.id}`)
          .set(ada.headers)
          .send({ version: 1, ...body });
      await patch({}).expect(400);
      await patch({ title: '' }).expect(400);
      await patch({ position: 3 }).expect(400);
    });

    it('404s for unknown tasks', async () => {
      await request(app)
        .patch('/api/tasks/nope')
        .set(ada.headers)
        .send({ title: 'x', version: 1 })
        .expect(404);
    });
  });

  describe('delete', () => {
    it('removes the task with 204 and compacts positions', async () => {
      const { body: first } = await createTask({ title: 'First' });
      await createTask({ title: 'Second' });
      await createTask({ title: 'Third' });

      const middle = (await request(app).get('/api/tasks').set(ada.headers)).body[1];
      await request(app).delete(`/api/tasks/${middle.id}`).set(ada.headers).expect(204);

      const { body } = await request(app).get('/api/tasks').set(ada.headers);
      expect(
        body.map(({ title, position }: { title: string; position: number }) => [title, position]),
      ).toEqual([
        ['Third', 0],
        ['First', 1],
      ]);
      await request(app).delete(`/api/tasks/${middle.id}`).set(ada.headers).expect(404);
      await request(app).get(`/api/tasks/${first.id}`).set(ada.headers).expect(200);
    });
  });

  describe('reorder', () => {
    const idsByTitle = async () => {
      const { body } = await request(app).get('/api/tasks').set(ada.headers);
      return Object.fromEntries(
        body.map(({ id, title }: { id: string; title: string }) => [title, id]),
      );
    };

    beforeEach(async () => {
      await createTask({ title: 'C' });
      await createTask({ title: 'B' });
      await createTask({ title: 'A' });
    });

    it('applies a full ordering', async () => {
      const ids = await idsByTitle();
      const res = await request(app)
        .put('/api/tasks/order')
        .set(ada.headers)
        .send({ ids: [ids.C, ids.A, ids.B] })
        .expect(200);

      expect(res.body.map(({ title }: { title: string }) => title)).toEqual(['C', 'A', 'B']);
      expect(await titles()).toEqual(['C', 'A', 'B']);
    });

    it('reorders a filtered subset without moving other tasks', async () => {
      const ids = await idsByTitle();
      await request(app)
        .put('/api/tasks/order')
        .set(ada.headers)
        .send({ ids: [ids.C, ids.A] });
      expect(await titles()).toEqual(['C', 'B', 'A']);
    });

    it('rejects duplicates, unknown and foreign ids with 400', async () => {
      const ids = await idsByTitle();
      const reorder = (body: object) =>
        request(app).put('/api/tasks/order').set(ada.headers).send(body);
      await reorder({ ids: [ids.A, ids.A] }).expect(400);
      await reorder({ ids: [] }).expect(400);
      const res = await reorder({ ids: [ids.A, 'ghost'] }).expect(400);
      expect(res.body.error.details).toEqual([{ path: 'ids', message: 'Task ghost not found' }]);
      expect(await titles()).toEqual(['A', 'B', 'C']);
    });
  });
});
