import { faker } from '@faker-js/faker'
import request from 'supertest'
import { expect } from 'vitest'
import type { Express } from 'express'

import buildApp from '../src/app.js'

export const app: Express = buildApp()

export const VALID_PASSWORD = 'Password1!'

type RegisterBody = {
  login: string
  email: string
  password: string
}

export function buildRegisterBody(overrides: Partial<RegisterBody> = {}): RegisterBody {
  const suffix = faker.string.alphanumeric({ length: 10, casing: 'lower' })
  return {
    login: `user${suffix}`,
    email: `${suffix}@example.test`,
    password: VALID_PASSWORD,
    ...overrides,
  }
}

export async function registerUser(
  overrides: Partial<RegisterBody> = {},
): Promise<RegisterBody> {
  const payload = buildRegisterBody(overrides)
  const res = await request(app).post('/api/auth/register').send(payload)

  expect(res.status).toBe(201)
  expect(res.body).toEqual({
    message: 'Registration successful',
    email: payload.email,
  })

  return payload
}

export async function findUserByEmail(email: string) {
  const res = await request(app).get('/api/users').query({ limit: 100, offset: 0 })
  expect(res.status).toBe(200)
  expect(Array.isArray(res.body)).toBe(true)

  const user = (res.body as Array<{ email: string }>).find((item) => item.email === email)
  expect(user).toBeDefined()
  return user as PublicUser
}

export type PublicUser = {
  id: number
  login: string
  email: string
  extraInfo: string | null
  role: 'USER' | 'ADMIN' | 'MODERATOR'
  isBlocked: boolean
  createdAt: string
  updatedAt: string
}

export function expectPublicUser(
  user: unknown,
  expected: Partial<PublicUser> & Pick<PublicUser, 'login' | 'email'>,
): asserts user is PublicUser {
  expect(user).toEqual({
    id: expect.any(Number),
    login: expected.login,
    email: expected.email,
    extraInfo: expected.extraInfo === undefined ? null : expected.extraInfo,
    role: expected.role ?? 'USER',
    isBlocked: expected.isBlocked ?? false,
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  })
  expect(user).not.toHaveProperty('passwordHash')
  expect(user).not.toHaveProperty('password_hash')
}
