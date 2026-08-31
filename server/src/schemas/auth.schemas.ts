import * as z from 'zod';
import { Role } from '../generated/prisma/client.js';

const registerBodySchema = z.object({
  login: z
    .string()
    .trim()
    .min(5, { message: 'Login must be between 5 and 64 characters' })
    .max(64, { message: 'Login must be between 5 and 64 characters' })
    .regex(/^[a-zA-Z][a-zA-Z0-9._-]*$/, {
      message:
        'Login may only contain Latin letters, digits, hyphens, and underscores, and must start with a letter',
    }),
  password: z
    .string()
    .min(12, { message: 'Password must be at least 12 characters long' })
    .regex(/[a-z]/, {
      message: 'Password must contain at least one lowercase letter',
    })
    .regex(/[A-Z]/, {
      message: 'Password must contain at least one uppercase letter',
    })
    .regex(/[0-9]/, { message: 'Password must contain at least one number' })
    .regex(/[^A-Za-z0-9]/, {
      message:
        'Password must contain at least one special character (@, $, !, %, *, #, ?, &, etc.)',
    }),
});

type RegisterBody = z.infer<typeof registerBodySchema>;

const loginBodySchema = z.object({
  login: z.string().trim(),
  password: z.string(),
});

type LoginBody = z.infer<typeof loginBodySchema>;

const tokenPayloadSchema = z.object({
  userId: z.number().int().positive(),
  login: z.string().min(1),
  role: z.enum([Role.USER, Role.ADMIN, Role.MODERATOR]),
});

type TokenPayload = z.infer<typeof tokenPayloadSchema>;

export {
  registerBodySchema,
  type RegisterBody,
  loginBodySchema,
  type LoginBody,
  tokenPayloadSchema,
  type TokenPayload,
};
