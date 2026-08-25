import * as z from 'zod';

const userParamsSchema = z.object({
  userId: z.coerce.number().gt(0),
});

const userPatchSchema = z.object({
  extraInfo: z.string().trim().max(1000),
});

const userListSchema = z.object({
  limit: z.coerce.number().gt(0).max(100).default(20),
  offset: z.coerce.number().gte(0).default(0),
});

type UserParams = z.infer<typeof userParamsSchema>;
type UserPatch = z.infer<typeof userPatchSchema>;
type UserList = z.infer<typeof userListSchema>;

export {
  userParamsSchema,
  type UserParams,
  userPatchSchema,
  type UserPatch,
  userListSchema,
  type UserList,
};
