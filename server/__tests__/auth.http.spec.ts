import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { Role } from '../src/generated/prisma/client.js';
import { generateAccessToken } from '../src/utils/json.token.js';
import { TokenType } from '../src/utils/token.type.js';
import { app, setCookies, cookieLine } from './helpers.js';

describe('Auth HTTP (no database)', () => {
  describe('POST /api/auth/refresh', () => {
    it('returns 401 when no refresh cookie is sent', async () => {
      const res = await request(app).post('/api/auth/refresh');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'No refresh token provided' });
    });

    it('returns 401 for a garbage refresh cookie', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'refreshToken=not-a-jwt');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Unauthorized' });
    });

    it('returns 401 when an access token is sent as refresh', async () => {
      const access = generateAccessToken(1, 'sneakerfan', Role.USER);
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${access}`);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Unauthorized' });
    });
  });

  describe('DELETE /api/auth/logout', () => {
    it('returns 200 when no refresh cookie is present', async () => {
      const res = await request(app).delete('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Logout successful' });

      const cookies = setCookies(res);
      expect(cookieLine(cookies, 'accessToken')).toMatch(/Max-Age=0|Expires=/i);
      expect(cookieLine(cookies, 'refreshToken')).toMatch(/Max-Age=0|Expires=/i);
    });

    it('returns 200 when the refresh cookie is invalid', async () => {
      const res = await request(app)
        .delete('/api/auth/logout')
        .set('Cookie', 'refreshToken=not-a-jwt');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Logout successful' });
    });
  });

  describe('access cookie on protected routes', () => {
    it('returns 401 for a malformed access cookie', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Cookie', 'accessToken=not-a-jwt');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Unauthorized' });
    });

    it('returns 401 for an expired access cookie', async () => {
      const token = jwt.sign(
        {
          userId: 1,
          login: 'expireduser',
          role: Role.USER,
          type: TokenType.ACCESS,
          exp: Math.floor(Date.now() / 1000) - 10,
        },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256' },
      );

      const res = await request(app)
        .get('/api/users')
        .set('Cookie', `accessToken=${token}`);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Unauthorized' });
    });
  });
});
