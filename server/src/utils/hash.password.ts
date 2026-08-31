import { argon2id, hash, verify } from 'argon2';

const hashPassword = async (password: string) => {
  return await hash(password, {
    type: argon2id,
  });
};

const verifyPassword = async (passwordHash: string, password: string) => {
  return await verify(passwordHash, password);
};

export { hashPassword, verifyPassword };
