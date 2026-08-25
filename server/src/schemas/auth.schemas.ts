import * as z from 'zod';

const registerBodySchema = z.object({
  login: z.string()
    .trim()
    .min(5, { message: "Login must be between 5 and 64 characters" })
    .max(64, { message: "Login must be between 5 and 64 characters" })
    .regex(/^[a-zA-Z][a-zA-Z0-9._-]*$/, {
      message: "Login may only contain Latin letters, digits, hyphens, and underscores, and must start with a letter",
    }),
  email: z.string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email()),
  password: z.string()
    .min(8, { message: "Password must be at least 8 characters long" })
    .regex(/[a-z]/, { message: "Password must contain at least one lowercase letter" })
    .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter" })
    .regex(/[0-9]/, { message: "Password must contain at least one number" })
    .regex(/[^A-Za-z0-9]/, { message: "Password must contain at least one special character (@, $, !, %, *, #, ?, &, etc.)" }),
});

type RegisterBody = z.infer<typeof registerBodySchema>;

export { registerBodySchema, type RegisterBody };
