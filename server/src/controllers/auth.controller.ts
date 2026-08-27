import { type Request, type Response } from 'express';
import * as authService from '../services/auth.service.js';
import { registerBodySchema } from '../schemas/auth.schemas.js';

// TODO: Implement email verification logic here in the registration process
const register = async (req: Request, res: Response) => {
  const body = await registerBodySchema.parseAsync(req.body);

  const result = await authService.register(
    body.login,
    body.email,
    body.password,
  );

  res.status(201).json({
    message: 'Registration successful',
    email: result.email,
  });
};

export { register };
