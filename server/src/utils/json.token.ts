import jwt from 'jsonwebtoken';
import { Role } from '../generated/prisma/client.js';
import {
  accessTokenPayloadSchema,
  refreshTokenPayloadSchema,
  type AccessTokenPayload,
  type RefreshTokenPayload,
} from '../schemas/auth.schemas.js';
import { v4 as uuidv4 } from 'uuid';
import { TokenType } from './token.type.js';

const readMaxAges = (): { access: number; refresh: number } => {
  const access = Number(process.env.MAX_AGE_ACCESS_TOKEN_MILLISECONDS);
  const refresh = Number(process.env.MAX_AGE_REFRESH_TOKEN_MILLISECONDS);
  if (isNaN(access) || isNaN(refresh)) {
    throw new Error(
      'MAX_AGE_ACCESS_TOKEN_MILLISECONDS and MAX_AGE_REFRESH_TOKEN_MILLISECONDS must be numbers',
    );
  }
  return { access, refresh };
};

const {
  access: MAX_AGE_ACCESS_TOKEN_MILLISECONDS,
  refresh: MAX_AGE_REFRESH_TOKEN_MILLISECONDS,
} = readMaxAges();

const readJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
};

const JWT_SECRET = readJwtSecret();

const generateAccessToken = (userId: number, login: string, role: Role) => {
  return jwt.sign({ userId, login, role, type: TokenType.ACCESS }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: MAX_AGE_ACCESS_TOKEN_MILLISECONDS / 1000,
  });
};

const generateRefreshToken = (userId: number) => {
  const jti = uuidv4();
  const token = jwt.sign({ userId, type: TokenType.REFRESH, jti }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: MAX_AGE_REFRESH_TOKEN_MILLISECONDS / 1000,
  });
  return { token, jti };
};

const verifyAccessToken = (token: string): AccessTokenPayload => {
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  const parsed = accessTokenPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new jwt.JsonWebTokenError('Invalid token payload');
  }
  return parsed.data;
};

const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  const parsed = refreshTokenPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new jwt.JsonWebTokenError('Invalid token payload');
  }
  return parsed.data;
};

export {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  MAX_AGE_ACCESS_TOKEN_MILLISECONDS,
  MAX_AGE_REFRESH_TOKEN_MILLISECONDS,
  TokenType,
};
export type { AccessTokenPayload, RefreshTokenPayload };
