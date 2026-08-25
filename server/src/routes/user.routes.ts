import express from 'express';
import {deleteUser, getUsersList, getUser, updateUser} from '../controllers/user.controller.js'
import { asyncHandler } from '../utils/async.handler.js';

const userRouter = express.Router();

//CRUD USER
userRouter.get('/', asyncHandler(getUsersList));
userRouter.get('/:userId', asyncHandler(getUser));
userRouter.patch('/:userId', asyncHandler(updateUser));
userRouter.delete('/:userId', asyncHandler(deleteUser));

export default userRouter;