import express from 'express';
import {
  blockUser,
  deleteUser,
  getUsersList,
  getUser,
  unblockUser,
  updateUser,
} from '../controllers/user.controller.js';
import { asyncHandler } from '../utils/async.handler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require.role.js';
import {
  requireSelfOrAdmin,
  requireSelfOrStaff,
} from '../middleware/require.self.or.admin.js';
import { Role } from '../generated/prisma/client.js';

const userRouter = express.Router();

userRouter.use(authenticate);

userRouter.get(
  '/',
  requireRole(Role.ADMIN, Role.MODERATOR),
  asyncHandler(getUsersList),
);
userRouter.post(
  '/:userId/block',
  requireRole(Role.ADMIN),
  asyncHandler(blockUser),
);
userRouter.post(
  '/:userId/unblock',
  requireRole(Role.ADMIN),
  asyncHandler(unblockUser),
);
userRouter.get('/:userId', requireSelfOrStaff, asyncHandler(getUser));
userRouter.patch('/:userId', requireSelfOrAdmin, asyncHandler(updateUser));
userRouter.delete('/:userId', requireSelfOrAdmin, asyncHandler(deleteUser));

export default userRouter;
