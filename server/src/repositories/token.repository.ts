import { db } from '../prisma/db.js';
import { MAX_AGE_REFRESH_TOKEN_MILLISECONDS } from '../utils/json.token.js';

const updateRefreshToken = async (jti: string, newJti: string) => {
  return db.token.update({
    where: { jti },
    data: {
      jti: newJti,
      expiresAt: new Date(Date.now() + MAX_AGE_REFRESH_TOKEN_MILLISECONDS),
    },
  });
};

const deleteRefreshToken = async (jti: string) => {
  return db.token.delete({
    where: { jti },
  });
};

const createRefreshToken = async (userId: number, jti: string) => {
  return db.token.create({
    data: {
      userId,
      jti,
      expiresAt: new Date(Date.now() + MAX_AGE_REFRESH_TOKEN_MILLISECONDS),
    },
  });
};

const deleteExpiredRefreshTokens = async () => {
  return db.token.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
};

const deleteExpiredRefreshTokenByUserId = async (userId: number) => {
  return db.token.deleteMany({
    where: { userId, expiresAt: { lt: new Date() } },
  });
};

export {
  updateRefreshToken,
  deleteRefreshToken,
  createRefreshToken,
  deleteExpiredRefreshTokens,
  deleteExpiredRefreshTokenByUserId,
};
