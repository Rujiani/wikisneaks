import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../generated/prisma/client.js';
import { forbidden, unauthorized } from '../utils/http.errors.js';

/**
 * Allows the request only if `req.user.role` is one of `allowedRoles`.
 * Must run after `authenticate`.
 */
const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) unauthorized();
    if (!allowedRoles.includes(req.user!.role)) forbidden();
    next();
  };
};

export { requireRole };
