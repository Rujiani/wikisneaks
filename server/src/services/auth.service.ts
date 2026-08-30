import argon2, { argon2id } from 'argon2';
import * as userRepo from '../repositories/user.repository.js';
import createHttpError from 'http-errors';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { hashEmail, hashEmailAllVersions } from '../utils/hash.email.js';

/**
 * Register a user: store argon2 password hash and HMAC email fingerprint.
 *
 * Email must already be normalized (trim + lowercase). Uniqueness is checked
 * against hashes under every live pepper, then the row is written with the
 * current pepper version.
 *
 * @param login - Unique login.
 * @param email - Normalized email (not stored in plaintext).
 * @param password - Plaintext password (hashed with argon2id before insert).
 * @throws HttpError 409 if login or email fingerprint already exists.
 */
const register = async (login: string, email: string, password: string) => {
  const candidates = hashEmailAllVersions(email);
  const existing = await userRepo.findByAnyEmailHash(
    candidates.map((c) => c.hash),
  );
  if (existing) {
    throw createHttpError(409, 'Email or login is already registered');
  }

  const { hash: emailHash, pepperVersion: emailPepperVersion } =
    hashEmail(email);
  const passwordHash = await argon2.hash(password, { type: argon2id });

  try {
    await userRepo.addUser({
      login,
      emailHash,
      emailPepperVersion,
      passwordHash,
    });
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
      throw createHttpError(409, 'Email or login is already registered');
    }
    throw err;
  }
};

/**
 * Re-bind an account email after a pepper rotation.
 *
 * The user re-submits plaintext email; we match it against any live pepper
 * hash, then rewrite `email_hash` / `email_pepper_version` under the current
 * pepper. Also sets `is_email_verified` (legacy side effect — not the same as
 * SMTP verification).
 *
 * @param userId - Account to upgrade.
 * @param email - Normalized email claimed by the user.
 * @returns Updated id and pepper version.
 * @throws HttpError 404 if the user is missing; 400 if email does not match.
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

export { register, reconfirmEmail };
