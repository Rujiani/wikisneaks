import express from 'express';
import * as authController from '../controllers/auth.controller.js';
import { asyncHandler } from '../utils/async.handler.js';

const authRouter = express.Router();

authRouter.post('/register', asyncHandler(authController.register));
authRouter.post('/login', asyncHandler(authController.login));
authRouter.post('/refresh', asyncHandler(authController.refresh));
authRouter.delete('/logout', asyncHandler(authController.logout));

export default authRouter;
