import { faker } from '@faker-js/faker';
import request from 'supertest';
import { expect } from 'vitest';
import type { Express } from 'express';

import buildApp from '../src/app.js';
import { hashEmail, getCurrentPepperVersion } from '../src/utils/hash.email.js';

export const app: Express = buildApp();

export const VALID_PASSWORD = 'Password1!';

type RegisterBody = {
  login: string;
  email: string;
  password: string;
};

export function buildRegisterBody(
  overrides: Partial<RegisterBody> = {},
): RegisterBody {
  const suffix = faker.string.alphanumeric({ length: 10, casing: 'lower' });
  return {
    login: `user${suffix}`,
    email: `${suffix}@example.test`,
    password: VALID_PASSWORD,
    ...overrides,
  };
}

export async function registerUser(
  overrides: Partial<RegisterBody> = {},
): Promise<RegisterBody> {
  const payload = buildRegisterBody(overrides);
  const res = await request(app).post('/api/auth/register').send(payload);

  expect(res.status).toBe(201);
  expect(res.body).toEqual({
    message: 'Registration successful',
  });

  return payload;
}

export async function findUserByLogin(login: string) {
  const res = await request(app)
    .get('/api/users')
    .query({ limit: 100, offset: 0 });
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);

  const user = (res.body as Array<{ login: string }>).find(
    (item) => item.login === login,
  );
  expect(user).toBeDefined();
  return user as PublicUser;
}

export type PublicUser = {
  id: number;
  login: string;
  extraInfo: string | null;
  role: 'USER' | 'ADMIN' | 'MODERATOR';
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
};

export function expectPublicUser(
  user: unknown,
  expected: Partial<PublicUser> & Pick<PublicUser, 'login'>,
): asserts user is PublicUser {
  expect(user).toEqual({
    id: expect.any(Number),
    login: expected.login,
    extraInfo: expected.extraInfo === undefined ? null : expected.extraInfo,
    role: expected.role ?? 'USER',
    isBlocked: expected.isBlocked ?? false,
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });
  expect(user).not.toHaveProperty('email');
  expect(user).not.toHaveProperty('emailHash');
  expect(user).not.toHaveProperty('email_hash');
  expect(user).not.toHaveProperty('passwordHash');
  expect(user).not.toHaveProperty('password_hash');
}

export function expectStoredEmailHash(
  storedHash: string | null | undefined,
  email: string,
  pepperVersion?: number,
) {
  const expected = hashEmail(email, pepperVersion ?? getCurrentPepperVersion());
  expect(storedHash).toBe(expected.hash);
  expect(storedHash).not.toBe(email);
}
