import argon2, { argon2id } from 'argon2'
import * as userRepo from '../repositories/user.repository.js'
import createHttpError from 'http-errors'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client'


const register = async (
    login: string,
    email: string,
    password: string,
) => {
    try {
        const hash = await argon2.hash(password, { type: argon2id });
        return await userRepo.addUser({ login, email, passwordHash: hash });
      } catch (err) {
        if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
          throw createHttpError(409, "Email or login is already registered");
        }
        throw err;
      }
}

export {register};
