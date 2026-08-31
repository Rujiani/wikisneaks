import type { NextFunction, Request, Response } from 'express';
import { Role } from '../generated/prisma/client.js';
import { userParamsSchema } from '../schemas/user.schemas.js';
import { forbidden, unauthorized } from '../utils/http.errors.js';

/**
 * Allows access to `:userId` for the account owner or any of `allowedRoles`.
 * Must run after `authenticate`.
 */
const requireSelfOrRoles = (...allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const actor = req.user;
    if (!actor) return unauthorized();

    const { userId } = userParamsSchema.parse(req.params);
    const isOwner = actor.userId === userId;
    const hasRole = allowedRoles.includes(actor.role);
    if (!isOwner && !hasRole) forbidden();

    next();
  };
};

/** Owner or admin. */
const requireSelfOrAdmin = requireSelfOrRoles(Role.ADMIN);

/** Owner, admin, or moderator. */
const requireSelfOrStaff = requireSelfOrRoles(Role.ADMIN, Role.MODERATOR);

export { requireSelfOrRoles, requireSelfOrAdmin, requireSelfOrStaff };
