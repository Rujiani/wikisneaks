import argon2, { argon2id } from 'argon2';
import * as userRepo from '../repositories/user.repository.js';
import createHttpError from 'http-errors';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { hashEmail, hashEmailAllVersions } from '../utils/hash.email.js';

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
 * After a pepper rotation: user re-submits email → verify against any live pepper,
 * then rewrite hash under the current version (and mark email verified).
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
