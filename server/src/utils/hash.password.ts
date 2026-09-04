import { argon2id, hash, verify } from 'argon2';

const DUMMY_PASSWORD_HASH = await hash(
  '000000000000000000000000000000000000000',
  {
    type: argon2id,
  },
);

const hashPassword = async (password: string) => {
  return await hash(password, {
    type: argon2id,
  });
};

const verifyPassword = async (passwordHash: string, password: string) => {
  return await verify(passwordHash, password);
};

export { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH };
