import { faker } from '@faker-js/faker';
import request from 'supertest';
import { expect } from 'vitest';
import type { Express } from 'express';
import type { TestAgent } from 'supertest';

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

/**
 * Returns a supertest agent with cookies from a successful login.
 * The agent's cookie jar holds the httpOnly accessToken + refreshToken.
 */
export async function createAgent(login: string, password: string): Promise<TestAgent> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ login, password });
  expect(res.status).toBe(200);
  return agent;
}

export async function registerUser(
  overrides: Partial<RegisterBody> = {},
): Promise<RegisterBody> {
  const payload = buildRegisterBody(overrides);
  const res = await request(app).post('/api/auth/register').send(payload);

  expect(res.status).toBe(201);
  expect(res.body).toEqual({ message: 'Registration successful' });

  return payload;
}

/** Register via an agent so the cookie jar already holds the session. */
export async function registerAndLogin(
  overrides: Partial<RegisterBody> = {},
): Promise<RegisterBody & { agent: TestAgent; id: number }> {
  const payload = buildRegisterBody(overrides);
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send(payload);

  expect(res.status).toBe(201);
  expect(res.body).toEqual({ message: 'Registration successful' });

  const user = await findUserByLogin(payload.login);
  return { ...payload, agent, id: user.id };
}

export async function registerAdmin(): Promise<
  RegisterBody & { agent: TestAgent; id: number }
> {
  const session = await registerAndLogin();
  await db.user.update({
    where: { login: session.login },
    data: { role: Role.ADMIN },
  });
  // Register JWT still has USER; refresh re-signs with the current DB role.
  const refresh = await session.agent.post('/api/auth/refresh');
  expect(refresh.status).toBe(200);
  return session;
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

export function setCookies(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers['set-cookie'];
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') return [raw];
  return [];
}

export function cookieLine(cookies: string[], name: string): string {
  const line = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  expect(line).toBeDefined();
  return line!;
}

export function cookieValue(cookies: string[], name: string): string {
  return cookieLine(cookies, name).slice(name.length + 1).split(';')[0]!;
}

export function cookieHeader(cookies: string[]): string {
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

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
