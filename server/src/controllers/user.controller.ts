import { type Request, type Response } from 'express';
import * as userService from '../services/user.service.js';
import {
  userPatchSchema,
  userParamsSchema,
  userListSchema,
} from '../schemas/user.schemas.js';

const getUser = async (req: Request, res: Response) => {
  const params = await userParamsSchema.parseAsync(req.params);
  const user = await userService.getUser(params.userId);
  res.json({ user });
};

const getUsersList = async (req: Request, res: Response) => {
  const query = await userListSchema.parseAsync(req.query);
  const users = await userService.getUsersList(query.limit, query.offset);
  res.json({ users });
};

const updateUser = async (req: Request, res: Response) => {
  const params = await userParamsSchema.parseAsync(req.params);
  const body = await userPatchSchema.parseAsync(req.body);
  const user = await userService.updateExtraInfo(params.userId, body.extraInfo);
  res.status(200).json({ user });
};

const deleteUser = async (req: Request, res: Response) => {
  const params = await userParamsSchema.parseAsync(req.params);
  await userService.deleteUser(params.userId);
  res.sendStatus(204);
};

const blockUser = async (req: Request, res: Response) => {
  const params = await userParamsSchema.parseAsync(req.params);
  const user = await userService.setBlocked(
    req.user!.userId,
    params.userId,
    true,
  );
  res.status(200).json({ user });
};

const unblockUser = async (req: Request, res: Response) => {
  const params = await userParamsSchema.parseAsync(req.params);
  const user = await userService.setBlocked(
    req.user!.userId,
    params.userId,
    false,
  );
  res.status(200).json({ user });
};

export {
  getUser,
  getUsersList,
  updateUser,
  deleteUser,
  blockUser,
  unblockUser,
};
