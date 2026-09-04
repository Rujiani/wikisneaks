import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDB, connectDB, db } from '../src/prisma/db.js';
import { deleteExpiredRefreshTokens } from '../src/repositories/token.repository.js';
import tokenCache from '../src/middleware/token.cache.js';
import { generateRefreshToken } from '../src/utils/json.token.js';
import {
  app,
  cookieHeader,
  cookieLine,
  cookieValue,
  registerAdmin,
  registerAndLogin,
  registerUser,
  setCookies,
} from './helpers.js';

function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('test_db')) {
    throw new Error(
      'Refusing to run auth tests: DATABASE_URL must point at the dedicated test database (test_db). Run via `npm test`.',
    );
  }
}

describe('Auth sessions', () => {
  beforeAll(async () => {
    assertTestDatabase();
    await connectDB();
  });

  afterAll(async () => {
    await closeDB();
  });

  beforeEach(async () => {
    tokenCache.clear();
    await db.$executeRaw`TRUNCATE TABLE "ws_refresh_token", "ws_user" RESTART IDENTITY CASCADE`;
  });

  describe('auth cookies', () => {
    it('sets httpOnly SameSite cookies and scopes refresh to /api/auth', async () => {
      const payload = await registerUser();
      const res = await request(app).post('/api/auth/login').send(payload);

      expect(res.status).toBe(200);
      const cookies = setCookies(res);

      const access = cookieLine(cookies, 'accessToken');
      expect(access.toLowerCase()).toContain('httponly');
      expect(access.toLowerCase()).toContain('samesite=strict');
      expect(access.toLowerCase()).not.toContain('secure');

      const refresh = cookieLine(cookies, 'refreshToken');
      expect(refresh.toLowerCase()).toContain('httponly');
      expect(refresh.toLowerCase()).toContain('samesite=strict');
      expect(refresh).toMatch(/Path=\/api\/auth/i);
      expect(access).not.toMatch(/Path=\/api\/auth/i);
    });

    it('persists a refresh token with a future expiry on register', async () => {
      const payload = await registerUser();
      const user = await db.user.findUnique({ where: { login: payload.login } });
      const tokens = await db.token.findMany({ where: { userId: user!.id } });

      expect(tokens).toHaveLength(1);
      expect(tokens[0]!.jti).toEqual(expect.any(String));
      expect(tokens[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('rotates cookies and the stored jti', async () => {
      const payload = await registerUser();
      const loginRes = await request(app).post('/api/auth/login').send(payload);
      const oldRefresh = cookieValue(setCookies(loginRes), 'refreshToken');
      const oldJti = (jwt.decode(oldRefresh) as { jti: string }).jti;
      const user = await db.user.findUnique({ where: { login: payload.login } });
      const before = await db.token.findMany({ where: { userId: user!.id } });

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeader(setCookies(loginRes)));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Refresh successful' });

      const nextRefresh = cookieValue(setCookies(res), 'refreshToken');
      const nextAccess = cookieValue(setCookies(res), 'accessToken');
      expect(nextRefresh).not.toBe(oldRefresh);

      const after = await db.token.findMany({ where: { userId: user!.id } });
      expect(after).toHaveLength(before.length);
      expect(after.map((row) => row.jti)).not.toContain(oldJti);

      const me = await request(app)
        .get(`/api/users/${user!.id}`)
        .set('Cookie', `accessToken=${nextAccess}`);
      expect(me.status).toBe(200);
    });

    it('returns the same new pair for concurrent refreshes of one jti', async () => {
      const payload = await registerUser();
      const loginRes = await request(app).post('/api/auth/login').send(payload);
      const header = cookieHeader(setCookies(loginRes));

      const [first, second] = await Promise.all([
        request(app).post('/api/auth/refresh').set('Cookie', header),
        request(app).post('/api/auth/refresh').set('Cookie', header),
      ]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(cookieValue(setCookies(first), 'accessToken')).toBe(
        cookieValue(setCookies(second), 'accessToken'),
      );
      expect(cookieValue(setCookies(first), 'refreshToken')).toBe(
        cookieValue(setCookies(second), 'refreshToken'),
      );
    });

    it('rejects a reused refresh token after rotation', async () => {
      const payload = await registerUser();
      const loginRes = await request(app).post('/api/auth/login').send(payload);
      const header = cookieHeader(setCookies(loginRes));

      const first = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', header);
      expect(first.status).toBe(200);

      tokenCache.clear();

      const reused = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', header);
      expect(reused.status).toBe(401);
      expect(reused.body).toEqual({ message: 'Refresh token not found' });
    });

    it('returns 403 when the account is blocked', async () => {
      const admin = await registerAdmin();
      const target = await registerAndLogin();

      const blocked = await admin.agent.post(`/api/users/${target.id}/block`);
      expect(blocked.status).toBe(200);

      const res = await target.agent.post('/api/auth/refresh');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: 'Account is blocked' });
    });

    it('returns 401 when the user no longer exists', async () => {
      const session = await registerAndLogin();
      await db.user.delete({ where: { id: session.id } });

      const res = await session.agent.post('/api/auth/refresh');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Invalid refresh token' });
    });
  });

  describe('DELETE /api/auth/logout', () => {
    it('clears cookies and deletes the session refresh token', async () => {
      const payload = await registerUser();
      const loginRes = await request(app).post('/api/auth/login').send(payload);
      const header = cookieHeader(setCookies(loginRes));
      const refresh = cookieValue(setCookies(loginRes), 'refreshToken');
      const decoded = jwt.decode(refresh) as { jti: string };
      const user = await db.user.findUnique({ where: { login: payload.login } });

      expect(
        await db.token.count({ where: { userId: user!.id, jti: decoded.jti } }),
      ).toBe(1);

      const res = await request(app)
        .delete('/api/auth/logout')
        .set('Cookie', header);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Logout successful' });

      const cleared = setCookies(res);
      expect(cookieLine(cleared, 'accessToken')).toMatch(/Max-Age=0|Expires=/i);
      expect(cookieLine(cleared, 'refreshToken')).toMatch(/Max-Age=0|Expires=/i);

      expect(
        await db.token.count({ where: { userId: user!.id, jti: decoded.jti } }),
      ).toBe(0);

      tokenCache.clear();
      const refreshAgain = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', header);
      expect(refreshAgain.status).toBe(401);
      expect(refreshAgain.body).toEqual({ message: 'Refresh token not found' });
    });
  });

  describe('refresh token store', () => {
    it('drops expired tokens for the user on login, not other users', async () => {
      const payload = await registerUser();
      const user = await db.user.findUnique({ where: { login: payload.login } });
      await db.token.updateMany({
        where: { userId: user!.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const other = await registerUser();
      const otherUser = await db.user.findUnique({
        where: { login: other.login },
      });
      await db.token.updateMany({
        where: { userId: otherUser!.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await request(app).post('/api/auth/login').send(payload);
      expect(res.status).toBe(200);

      const mine = await db.token.findMany({ where: { userId: user!.id } });
      expect(mine).toHaveLength(1);
      expect(mine[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());

      const others = await db.token.findMany({
        where: { userId: otherUser!.id },
      });
      expect(others).toHaveLength(1);
      expect(others[0]!.expiresAt.getTime()).toBeLessThan(Date.now());
    });

    it('deletes globally expired refresh tokens', async () => {
      const payload = await registerUser();
      const user = await db.user.findUnique({ where: { login: payload.login } });
      await db.token.updateMany({
        where: { userId: user!.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const live = await registerUser();
      const liveUser = await db.user.findUnique({
        where: { login: live.login },
      });

      const result = await deleteExpiredRefreshTokens();
      expect(result.count).toBe(1);
      expect(await db.token.count({ where: { userId: user!.id } })).toBe(0);
      expect(await db.token.count({ where: { userId: liveUser!.id } })).toBe(1);
    });

    it('returns 401 when the refresh jti is not in the store', async () => {
      const session = await registerAndLogin();
      const { token } = generateRefreshToken(session.id);

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${token}`);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Refresh token not found' });
    });
  });
});
