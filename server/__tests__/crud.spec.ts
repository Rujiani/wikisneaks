import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDB, connectDB, db } from '../src/prisma/db.js';
import {
  app,
  buildRegisterBody,
  expectPublicUser,
  findUserByLogin,
  registerUser,
} from './helpers.js';

function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('test_db')) {
    throw new Error(
      'Refusing to run CRUD tests: DATABASE_URL must point at the dedicated test database (test_db). Run via `npm test`.',
    );
  }
}

describe('User CRUD', () => {
  beforeAll(async () => {
    assertTestDatabase();
    await connectDB();
  });

  afterAll(async () => {
    await closeDB();
  });

  beforeEach(async () => {
    await db.$executeRaw`TRUNCATE TABLE "ws_user" RESTART IDENTITY CASCADE`;
  });

  describe('POST /api/auth/register', () => {
    it('creates a user and returns 201', async () => {
      const payload = await registerUser();
      const user = await findUserByLogin(payload.login);

      expectPublicUser(user, { login: payload.login });
      expect(user.id).toBe(1);
    });

    it('stores no email fingerprint at registration', async () => {
      const payload = await registerUser();
      const stored = await db.user.findUnique({
        where: { login: payload.login },
      });

      expect(stored?.emailHash).toBeNull();
      expect(stored?.emailPepperVersion).toBeNull();
      expect(stored?.isEmailVerified).toBe(false);
    });

    it('does not expose the password hash', async () => {
      const payload = await registerUser();
      const user = await findUserByLogin(payload.login);
      const stored = await db.user.findUnique({
        where: { login: payload.login },
      });

      expect(stored?.passwordHash).toEqual(expect.any(String));
      expect(stored?.passwordHash).not.toBe(payload.password);
      expect(JSON.stringify(user)).not.toContain(stored?.passwordHash);
    });

    it('returns 400 when the body is invalid', async () => {
      const res = await request(app).post('/api/auth/register').send({
        login: 'ab',
        password: 'short',
      });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: 'Validation error' });
      expect(res.body.issues).toEqual(expect.any(Array));
    });

    it('ignores email if sent in the body', async () => {
      const payload = buildRegisterBody();
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...payload, email: 'ignored@example.test' });

      expect(res.status).toBe(201);

      const stored = await db.user.findUnique({
        where: { login: payload.login },
      });
      expect(stored?.emailHash).toBeNull();
    });

    it('returns 409 when login is already registered', async () => {
      const payload = await registerUser();
      const res = await request(app)
        .post('/api/auth/register')
        .send(buildRegisterBody({ login: payload.login }));

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        message: 'Login is already registered',
      });
    });
  });

  describe('GET /api/users', () => {
    it('returns an empty list when the database has no users', async () => {
      const res = await request(app).get('/api/users');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns created users newest first', async () => {
      const first = await registerUser();
      const second = await registerUser();

      const res = await request(app).get('/api/users');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expectPublicUser(res.body[0], {
        login: second.login,
      });
      expectPublicUser(res.body[1], { login: first.login });
    });

    it('paginates with limit and offset', async () => {
      const users = [
        await registerUser(),
        await registerUser(),
        await registerUser(),
      ];

      const page = await request(app)
        .get('/api/users')
        .query({ limit: 2, offset: 0 });
      expect(page.status).toBe(200);
      expect(page.body).toHaveLength(2);
      expect(page.body[0].login).toBe(users[2]?.login);
      expect(page.body[1].login).toBe(users[1]?.login);

      const next = await request(app)
        .get('/api/users')
        .query({ limit: 2, offset: 2 });
      expect(next.status).toBe(200);
      expect(next.body).toHaveLength(1);
      expect(next.body[0].login).toBe(users[0]?.login);
    });

    it('uses default limit and offset when query params are omitted', async () => {
      await registerUser();
      const res = await request(app).get('/api/users');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('returns 400 for invalid pagination query', async () => {
      const res = await request(app)
        .get('/api/users')
        .query({ limit: 0, offset: -1 });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: 'Validation error' });
    });
  });

  describe('GET /api/users/:userId', () => {
    it('returns a single user', async () => {
      const payload = await registerUser();
      const created = await findUserByLogin(payload.login);

      const res = await request(app).get(`/api/users/${created.id}`);

      expect(res.status).toBe(200);
      expectPublicUser(res.body.user, {
        login: payload.login,
      });
      expect(res.body.user.id).toBe(created.id);
    });

    it('returns 404 when the user does not exist', async () => {
      const res = await request(app).get('/api/users/1');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'User not found' });
    });

    it('returns 400 when userId is invalid', async () => {
      const res = await request(app).get('/api/users/not-a-number');

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: 'Validation error' });
    });
  });

  describe('PATCH /api/users/:userId', () => {
    it('updates extraInfo and returns the public user', async () => {
      const payload = await registerUser();
      const created = await findUserByLogin(payload.login);

      const res = await request(app)
        .patch(`/api/users/${created.id}`)
        .send({ extraInfo: '  likes sneaker drops  ' });

      expect(res.status).toBe(200);
      expectPublicUser(res.body.user, {
        login: payload.login,
        extraInfo: 'likes sneaker drops',
      });
    });

    it('ignores attempts to change fields other than extraInfo', async () => {
      const payload = await registerUser();
      const created = await findUserByLogin(payload.login);

      const res = await request(app).patch(`/api/users/${created.id}`).send({
        extraInfo: 'bio',
        role: 'ADMIN',
        isBlocked: true,
        login: 'hackedlogin',
        email: 'hacked@example.test',
      });

      expect(res.status).toBe(200);
      expectPublicUser(res.body.user, {
        login: payload.login,
        extraInfo: 'bio',
        role: 'USER',
        isBlocked: false,
      });
    });

    it('returns 404 when the user does not exist', async () => {
      const res = await request(app)
        .patch('/api/users/1')
        .send({ extraInfo: 'bio' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'User not found' });
    });

    it('returns 400 when extraInfo is missing or too long', async () => {
      const payload = await registerUser();
      const created = await findUserByLogin(payload.login);

      const missing = await request(app)
        .patch(`/api/users/${created.id}`)
        .send({});
      expect(missing.status).toBe(400);

      const tooLong = await request(app)
        .patch(`/api/users/${created.id}`)
        .send({ extraInfo: 'x'.repeat(1001) });
      expect(tooLong.status).toBe(400);
    });
  });

  describe('DELETE /api/users/:userId', () => {
    it('deletes a user and returns 204', async () => {
      const payload = await registerUser();
      const created = await findUserByLogin(payload.login);

      const res = await request(app).delete(`/api/users/${created.id}`);

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});

      const missing = await request(app).get(`/api/users/${created.id}`);
      expect(missing.status).toBe(404);

      const list = await request(app).get('/api/users');
      expect(list.body).toEqual([]);
    });

    it('returns 404 when the user does not exist', async () => {
      const res = await request(app).delete('/api/users/1');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'User not found' });
    });

    it('returns 400 when userId is not a positive integer', async () => {
      const res = await request(app).delete('/api/users/0');

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: 'Validation error' });
    });
  });
});
