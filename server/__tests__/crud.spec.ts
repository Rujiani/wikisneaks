import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDB, connectDB, db } from '../src/prisma/db.js';
import {
  app,
  bearer,
  buildRegisterBody,
  expectPublicUser,
  findUserByLogin,
  registerAdmin,
  registerAndLogin,
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

  describe('POST /api/auth/login', () => {
    it('returns a token for valid credentials', async () => {
      const payload = await registerUser();
      const res = await request(app).post('/api/auth/login').send(payload);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ token: expect.any(String) });
    });

    it('returns 401 for an unknown login without hashing a password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        login: 'nobodyhere',
        password: 'Password1!ab',
      });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Invalid login or password' });
    });

    it('returns 401 for a wrong password', async () => {
      const payload = await registerUser();
      const res = await request(app).post('/api/auth/login').send({
        login: payload.login,
        password: 'WrongPassword1!',
      });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Invalid login or password' });
    });

    it('returns 403 when the account is blocked', async () => {
      const payload = await registerUser();
      await db.user.update({
        where: { login: payload.login },
        data: { isBlocked: true },
      });

      const res = await request(app).post('/api/auth/login').send(payload);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: 'Account is blocked' });
    });
  });

  describe('GET /api/users', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Unauthorized' });
    });

    it('returns 401 when the Authorization scheme is not Bearer', async () => {
      const session = await registerAndLogin();
      const res = await request(app)
        .get('/api/users')
        .set({ Authorization: `Basic ${session.token}` });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Unauthorized' });
    });

    it('returns 403 for a regular user', async () => {
      const session = await registerAndLogin();
      const res = await request(app)
        .get('/api/users')
        .set(bearer(session.token));

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: 'Forbidden' });
    });

    it('returns only the admin when no other users exist', async () => {
      const admin = await registerAdmin();
      const res = await request(app).get('/api/users').set(bearer(admin.token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expectPublicUser(res.body[0], { login: admin.login, role: 'ADMIN' });
    });

    it('returns created users newest first', async () => {
      const admin = await registerAdmin();
      const first = await registerUser();
      const second = await registerUser();

      const res = await request(app).get('/api/users').set(bearer(admin.token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expectPublicUser(res.body[0], { login: second.login });
      expectPublicUser(res.body[1], { login: first.login });
      expectPublicUser(res.body[2], { login: admin.login, role: 'ADMIN' });
    });

    it('paginates with limit and offset', async () => {
      const admin = await registerAdmin();
      const users = [
        await registerUser(),
        await registerUser(),
        await registerUser(),
      ];

      const page = await request(app)
        .get('/api/users')
        .set(bearer(admin.token))
        .query({ limit: 2, offset: 0 });
      expect(page.status).toBe(200);
      expect(page.body).toHaveLength(2);
      expect(page.body[0].login).toBe(users[2]?.login);
      expect(page.body[1].login).toBe(users[1]?.login);

      const next = await request(app)
        .get('/api/users')
        .set(bearer(admin.token))
        .query({ limit: 2, offset: 2 });
      expect(next.status).toBe(200);
      expect(next.body).toHaveLength(2);
      expect(next.body[0].login).toBe(users[0]?.login);
      expect(next.body[1].login).toBe(admin.login);
    });

    it('uses default limit and offset when query params are omitted', async () => {
      const admin = await registerAdmin();
      await registerUser();
      const res = await request(app).get('/api/users').set(bearer(admin.token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('returns 400 for invalid pagination query', async () => {
      const admin = await registerAdmin();
      const res = await request(app)
        .get('/api/users')
        .set(bearer(admin.token))
        .query({ limit: 0, offset: -1 });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: 'Validation error' });
    });
  });

  describe('GET /api/users/:userId', () => {
    it('returns a single user to the owner', async () => {
      const session = await registerAndLogin();

      const res = await request(app)
        .get(`/api/users/${session.id}`)
        .set(bearer(session.token));

      expect(res.status).toBe(200);
      expectPublicUser(res.body.user, {
        login: session.login,
      });
      expect(res.body.user.id).toBe(session.id);
    });

    it('returns 403 when another user requests the account', async () => {
      const owner = await registerAndLogin();
      const other = await registerAndLogin();

      const res = await request(app)
        .get(`/api/users/${owner.id}`)
        .set(bearer(other.token));

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: 'Forbidden' });
    });

    it('returns 404 when the user does not exist', async () => {
      const admin = await registerAdmin();
      const res = await request(app)
        .get('/api/users/999')
        .set(bearer(admin.token));

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'User not found' });
    });

    it('returns 400 when userId is invalid', async () => {
      const session = await registerAndLogin();
      const res = await request(app)
        .get('/api/users/not-a-number')
        .set(bearer(session.token));

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: 'Validation error' });
    });
  });

  describe('PATCH /api/users/:userId', () => {
    it('updates extraInfo and returns the public user', async () => {
      const session = await registerAndLogin();

      const res = await request(app)
        .patch(`/api/users/${session.id}`)
        .set(bearer(session.token))
        .send({ extraInfo: '  likes sneaker drops  ' });

      expect(res.status).toBe(200);
      expectPublicUser(res.body.user, {
        login: session.login,
        extraInfo: 'likes sneaker drops',
      });
    });

    it('ignores attempts to change fields other than extraInfo', async () => {
      const session = await registerAndLogin();

      const res = await request(app)
        .patch(`/api/users/${session.id}`)
        .set(bearer(session.token))
        .send({
          extraInfo: 'bio',
          role: 'ADMIN',
          isBlocked: true,
          login: 'hackedlogin',
          email: 'hacked@example.test',
        });

      expect(res.status).toBe(200);
      expectPublicUser(res.body.user, {
        login: session.login,
        extraInfo: 'bio',
        role: 'USER',
        isBlocked: false,
      });
    });

    it('returns 403 when another user tries to patch', async () => {
      const owner = await registerAndLogin();
      const other = await registerAndLogin();

      const res = await request(app)
        .patch(`/api/users/${owner.id}`)
        .set(bearer(other.token))
        .send({ extraInfo: 'bio' });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: 'Forbidden' });
    });

    it('returns 404 when the user does not exist', async () => {
      const admin = await registerAdmin();
      const res = await request(app)
        .patch('/api/users/999')
        .set(bearer(admin.token))
        .send({ extraInfo: 'bio' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'User not found' });
    });

    it('returns 400 when extraInfo is missing or too long', async () => {
      const session = await registerAndLogin();

      const missing = await request(app)
        .patch(`/api/users/${session.id}`)
        .set(bearer(session.token))
        .send({});
      expect(missing.status).toBe(400);

      const tooLong = await request(app)
        .patch(`/api/users/${session.id}`)
        .set(bearer(session.token))
        .send({ extraInfo: 'x'.repeat(1001) });
      expect(tooLong.status).toBe(400);
    });
  });

  describe('DELETE /api/users/:userId', () => {
    it('deletes a user and returns 204', async () => {
      const session = await registerAndLogin();
      const admin = await registerAdmin();

      const res = await request(app)
        .delete(`/api/users/${session.id}`)
        .set(bearer(session.token));

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});

      const missing = await request(app)
        .get(`/api/users/${session.id}`)
        .set(bearer(admin.token));
      expect(missing.status).toBe(404);

      const list = await request(app)
        .get('/api/users')
        .set(bearer(admin.token));
      expect(list.body).toHaveLength(1);
      expect(list.body[0].login).toBe(admin.login);
    });

    it('returns 404 when the user does not exist', async () => {
      const admin = await registerAdmin();
      const res = await request(app)
        .delete('/api/users/999')
        .set(bearer(admin.token));

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'User not found' });
    });

    it('returns 400 when userId is not a positive integer', async () => {
      const session = await registerAndLogin();
      const res = await request(app)
        .delete('/api/users/0')
        .set(bearer(session.token));

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: 'Validation error' });
    });
  });

  describe('POST /api/users/:userId/block and unblock', () => {
    it('lets an admin block and unblock a user', async () => {
      const admin = await registerAdmin();
      const target = await registerAndLogin();

      const blocked = await request(app)
        .post(`/api/users/${target.id}/block`)
        .set(bearer(admin.token));

      expect(blocked.status).toBe(200);
      expectPublicUser(blocked.body.user, {
        login: target.login,
        isBlocked: true,
      });

      const denied = await request(app).post('/api/auth/login').send({
        login: target.login,
        password: target.password,
      });
      expect(denied.status).toBe(403);
      expect(denied.body).toEqual({ message: 'Account is blocked' });

      const unblocked = await request(app)
        .post(`/api/users/${target.id}/unblock`)
        .set(bearer(admin.token));

      expect(unblocked.status).toBe(200);
      expectPublicUser(unblocked.body.user, {
        login: target.login,
        isBlocked: false,
      });

      const ok = await request(app).post('/api/auth/login').send({
        login: target.login,
        password: target.password,
      });
      expect(ok.status).toBe(200);
    });

    it('returns 403 for a non-admin', async () => {
      const actor = await registerAndLogin();
      const target = await registerAndLogin();

      const res = await request(app)
        .post(`/api/users/${target.id}/block`)
        .set(bearer(actor.token));

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: 'Forbidden' });
    });

    it('returns 403 when an admin targets themselves', async () => {
      const admin = await registerAdmin();
      const res = await request(app)
        .post(`/api/users/${admin.id}/block`)
        .set(bearer(admin.token));

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        message: 'Cannot block or unblock yourself',
      });
    });

    it('returns 404 when the user does not exist', async () => {
      const admin = await registerAdmin();
      const res = await request(app)
        .post('/api/users/999/block')
        .set(bearer(admin.token));

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'User not found' });
    });
  });
});
