import type { NextFunction, Request, Response } from 'express';
import { getToken, verifyToken } from '../utils/json.token.js';
import { unauthorized } from '../utils/http.errors.js';

/**
 * Verifies the Bearer JWT and sets `req.user`. Call before role / owner guards.
 */
const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  const token = getToken(req.headers.authorization);
  if (!token) return unauthorized();

  try {
    req.user = verifyToken(token);
  } catch {
    return unauthorized();
  }

  next();
};

export { authenticate };
