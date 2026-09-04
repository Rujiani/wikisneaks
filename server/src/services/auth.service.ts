import * as userRepo from '../repositories/user.repository.js';
import * as tokenRepo from '../repositories/token.repository.js';
import createHttpError from 'http-errors';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { hashEmail, hashEmailAllVersions } from '../utils/hash.email.js';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from '../utils/hash.password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/json.token.js';
import { unauthorized } from '../utils/http.errors.js';
import { JsonWebTokenError } from 'jsonwebtoken';
import tokenCache from '../middleware/token.cache.js';

/**
 * Register a user with login + password only.
 * Email binding (HMAC fingerprint) is optional and handled later via utils.
 *
 * @param login - Unique login.
 * @param password - Plaintext password (hashed with argon2id before insert).
 * @returns Access JWT and refresh JWT (refresh `jti` is stored in `ws_refresh_token`).
 * @throws HttpError 409 if login already exists.
 */
const register = async (login: string, password: string) => {
  const passwordHash = await hashPassword(password);

  try {
    const user = await userRepo.addUser({ login, passwordHash });
    const { token: refreshToken, jti: refreshTokenJti } = generateRefreshToken(
      user.id,
    );
    await tokenRepo.createRefreshToken(user.id, refreshTokenJti);
    return {
      accessToken: generateAccessToken(user.id, user.login, user.role),
      refreshToken,
    };
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

/**
 * Verify credentials and issue a new refresh session (does not replace older rows).
 * Unknown logins still run argon2 against `DUMMY_PASSWORD_HASH` so timing does
 * not leak whether the login exists. Expired refresh rows for this user are
 * deleted after the new row is inserted.
 *
 * @throws HttpError 401 invalid credentials; 403 if the account is blocked.
 */
const login = async (login: string, password: string) => {
  const user = await userRepo.findByLoginWithHash(login);
  if (!user) {
    await verifyPassword(DUMMY_PASSWORD_HASH, password);
    throw createHttpError(401, 'Invalid login or password');
  }

  const isPasswordValid = await verifyPassword(user.passwordHash, password);
  if (!isPasswordValid) {
    throw createHttpError(401, 'Invalid login or password');
  }

  if (user.isBlocked) {
    throw createHttpError(403, 'Account is blocked');
  }

  const { token: refreshToken, jti: refreshTokenJti } = generateRefreshToken(
    user.id,
  );
  await tokenRepo.createRefreshToken(user.id, refreshTokenJti);
  await tokenRepo.deleteExpiredRefreshTokenByUserId(user.id);
  return {
    accessToken: generateAccessToken(user.id, user.login, user.role),
    refreshToken,
  };
};

/**
 * Rotate a refresh `jti` in place and mint a new access + refresh pair.
 * Concurrent calls with the same `jti` reuse one in-flight promise (`token.cache`, 3s TTL).
 *
 * @throws HttpError 401 if the user is gone or the `jti` is missing; 403 if blocked.
 */
const refresh = async (
  refreshToken: string,
): Promise<{
  newRefreshToken: string;
  newAccessToken: string;
}> => {
  try {
    const token = verifyRefreshToken(refreshToken);

    const user = await userRepo.findById(token.userId);
    if (!user) {
      throw createHttpError(401, 'Invalid refresh token');
    }

    if (user.isBlocked) {
      throw createHttpError(403, 'Account is blocked');
    }

    const refreshWithLock = async () => {
      const { token: newRefreshToken, jti: newJti } = generateRefreshToken(
        user.id,
      );

      await tokenRepo.updateRefreshToken(token.jti, newJti);

      return {
        newRefreshToken,
        newAccessToken: generateAccessToken(user.id, user.login, user.role),
      };
    };

    const tokens = tokenCache.get(token.jti);
    if (tokens) {
      return await tokens;
    }

    const newTokens = refreshWithLock().catch((err) => {
      tokenCache.delete(token.jti);
      throw err;
    });

    tokenCache.set(token.jti, newTokens);
    return await newTokens;
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2025') {
      throw unauthorized('Refresh token not found');
    }
    throw err;
  }
};

/**
 * Delete the refresh row for this JWT. Invalid / already-deleted tokens are ignored.
 */
const logout = async (refreshToken: string) => {
  try {
    const token = verifyRefreshToken(refreshToken);
    await tokenRepo.deleteRefreshToken(token.jti);
  } catch (err) {
    if (
      (err instanceof PrismaClientKnownRequestError && err.code === 'P2025') ||
      err instanceof JsonWebTokenError
    ) {
      return;
    }
    throw err;
  }
};

export { register, reconfirmEmail, login, refresh, logout };
