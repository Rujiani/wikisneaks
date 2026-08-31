import * as userRepo from '../repositories/user.repository.js';
import createHttpError from 'http-errors';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { hashEmail, hashEmailAllVersions } from '../utils/hash.email.js';
import { hashPassword, verifyPassword } from '../utils/hash.password.js';
import { generateToken } from '../utils/json.token.js';

/**
 * Register a user with login + password only.
 * Email binding (HMAC fingerprint) is optional and handled later via utils.
 *
 * @param login - Unique login.
 * @param password - Plaintext password (hashed with argon2id before insert).
 * @returns JWT token.
 * @throws HttpError 409 if login already exists.
 */
const register = async (login: string, password: string) => {
  const passwordHash = await hashPassword(password);

  try {
    const user = await userRepo.addUser({ login, passwordHash });
    return generateToken(user.id, user.login, user.role);
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
      throw createHttpError(409, 'Login is already registered');
    }
    throw err;
  }
};

/**
 * Bind or re-bind an account email after the user opts in / after pepper rotation.
 *
 * Not used by registration yet. Matches plaintext email against any live pepper
 * hash, then writes `email_hash` / `email_pepper_version` under the current pepper.
 *
 * @param userId - Account to upgrade.
 * @param email - Normalized email claimed by the user.
 * @returns Updated id and pepper version.
 * @throws HttpError 404 if the user is missing; 400 if email does not match an existing binding.
 */
const reconfirmEmail = async (userId: number, email: string) => {
  const user = await userRepo.findById(userId);
  if (!user) {
    throw createHttpError(404, 'User not found');
  }

  const stored = await userRepo.findByAnyEmailHash(
    hashEmailAllVersions(email).map((c) => c.hash),
  );
  if (!stored || stored.id !== userId) {
    throw createHttpError(400, 'Email does not match this account');
  }

  const next = hashEmail(email);
  return userRepo.upgradeEmailHash(userId, next.hash, next.pepperVersion);
};

const login = async (login: string, password: string) => {
  const user = await userRepo.findByLoginWithHash(login);
  if (!user) {
    throw createHttpError(401, 'Invalid login or password');
  }

  const isPasswordValid = await verifyPassword(user.passwordHash, password);
  if (!isPasswordValid) {
    throw createHttpError(401, 'Invalid login or password');
  }

  if (user.isBlocked) {
    throw createHttpError(403, 'Account is blocked');
  }

  return generateToken(user.id, user.login, user.role);
};

export { register, reconfirmEmail, login };
