import createHttpError from 'http-errors';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import * as repo from '../repositories/user.repository.js';

const _notFound = (errorMsg: string): never => {
  throw createHttpError(404, errorMsg);
};

const getUser = async (id: number) => {
  const user = await repo.findById(id);
  if (!user) _notFound('User not found');
  return user;
};

const getUsersList = async (limit: number, offset: number) => {
  return await repo.findMany(limit, offset);
};

const updateExtraInfo = async (id: number, extraInfo: string) => {
  try {
    return await repo.updateExtraInfo(id, extraInfo);
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2025') {
      _notFound('User not found');
    }
    throw err;
  }
};

const deleteUser = async (id: number) => {
  try {
    await repo.deleteById(id);
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2025') {
      _notFound('User not found');
    }
    throw err;
  }
};

export { getUser, getUsersList, updateExtraInfo, deleteUser };
