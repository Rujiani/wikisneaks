import { faker } from '@faker-js/faker';
import request from 'supertest';
import { expect } from 'vitest';
import type { Express } from 'express';

import buildApp from '../src/app.js';
import { db } from '../src/prisma/db.js';
import { Role } from '../src/generated/prisma/client.js';

export const app: Express = buildApp();

/** Meets policy: 12+ chars, upper, lower, digit, special. */
export const VALID_PASSWORD = 'Password1!ab';

type RegisterBody = {
  login: string;
  password: string;
};

export function buildRegisterBody(
  overrides: Partial<RegisterBody> = {},
): RegisterBody {
  const suffix = faker.string.alphanumeric({ length: 10, casing: 'lower' });
  return {
    login: `user${suffix}`,
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
    token: expect.any(String),
  });

  return payload;
}

export async function loginUser(
  login: string,
  password: string,
): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ login, password });

  expect(res.status).toBe(200);
  expect(res.body.token).toEqual(expect.any(String));
  return res.body.token as string;
}

export async function registerAndLogin(
  overrides: Partial<RegisterBody> = {},
): Promise<RegisterBody & { token: string; id: number }> {
  const payload = await registerUser(overrides);
  const token = await loginUser(payload.login, payload.password);
  const user = await findUserByLogin(payload.login);
  return { ...payload, token, id: user.id };
}

export async function registerAdmin(): Promise<
  RegisterBody & { token: string; id: number }
> {
  const payload = await registerUser();
  await db.user.update({
    where: { login: payload.login },
    data: { role: Role.ADMIN },
  });
  const token = await loginUser(payload.login, payload.password);
  const user = await findUserByLogin(payload.login);
  return { ...payload, token, id: user.id };
}

export function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function findUserByLogin(login: string) {
  const user = await db.user.findUnique({
    where: { login },
    select: {
      id: true,
      login: true,
      extraInfo: true,
      role: true,
      isBlocked: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  expect(user).not.toBeNull();
  return {
    ...user!,
    createdAt: user!.createdAt.toISOString(),
    updatedAt: user!.updatedAt.toISOString(),
  } as PublicUser;
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
