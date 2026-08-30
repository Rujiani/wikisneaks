import { type Request, type Response } from 'express';
import * as authService from '../services/auth.service.js';
import { registerBodySchema } from '../schemas/auth.schemas.js';

const register = async (req: Request, res: Response) => {
  const body = await registerBodySchema.parseAsync(req.body);

  await authService.register(body.login, body.password);

  res.status(201).json({
    message: 'Registration successful',
  });
};

export { register };
