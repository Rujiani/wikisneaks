import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/json.token.js';
import { unauthorized } from '../utils/http.errors.js';

/**
 * Reads `accessToken` from cookies, verifies it, and sets `req.user`.
 * Missing cookie → 401; bad/expired JWT → `JsonWebTokenError` → 401 in the app error handler.
 */
const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.cookies.accessToken;
  if (!token) return unauthorized();

  req.user = verifyAccessToken(token);
  next();
};

export { authenticate };
