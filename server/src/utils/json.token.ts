import jwt from 'jsonwebtoken';
import { Role } from '../generated/prisma/client.js';
import {
  tokenPayloadSchema,
  type TokenPayload,
} from '../schemas/auth.schemas.js';

const readJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
};

const JWT_SECRET = readJwtSecret();

const generateToken = (userId: number, login: string, role: Role) => {
  return jwt.sign({ userId, login, role }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1d',
  });
};

const BEARER = /^Bearer\s+(\S+)$/i;

const getToken = (authorization: string | undefined): string | undefined =>
  authorization?.match(BEARER)?.[1];

const verifyToken = (token: string): TokenPayload => {
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  const parsed = tokenPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new jwt.JsonWebTokenError('Invalid token payload');
  }
  return parsed.data;
};

export { generateToken, getToken, verifyToken };
export type { TokenPayload };
