import { type Request, type Response } from 'express';
import * as authService from '../services/auth.service.js';
import {
  registerBodySchema,
  loginBodySchema,
} from '../schemas/auth.schemas.js';

const register = async (req: Request, res: Response) => {
  const body = await registerBodySchema.parseAsync(req.body);

  const token = await authService.register(body.login, body.password);

  res.status(201).json({
    message: 'Registration successful',
    token,
  });
};

const login = async (req: Request, res: Response) => {
  const body = await loginBodySchema.parseAsync(req.body);
  const token = await authService.login(body.login, body.password);
  res.status(200).json({ token });
};

export { register, login };
