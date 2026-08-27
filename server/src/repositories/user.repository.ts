import { db } from '../prisma/db.js';

type CreateUserData = {
  login: string;
  email: string;
  passwordHash: string;
};

const USER_PUBLIC_SELECT = {
  id: true,
  login: true,
  email: true,
  extraInfo: true,
  role: true,
  isBlocked: true,
  createdAt: true,
  updatedAt: true,
} as const;

const findById = async (id: number) => {
  return db.user.findUnique({
    where: { id },
    select: USER_PUBLIC_SELECT,
  });
};

const addUser = async (data: CreateUserData) => {
  return db.user.create({
    data,
    select: { email: true },
  });
};

const findMany = async (limit: number, offset: number) => {
  return db.user.findMany({
    skip: offset,
    take: limit,
    select: USER_PUBLIC_SELECT,
    orderBy: { id: 'desc' },
  });
};

const updateExtraInfo = async (id: number, extraInfo: string) => {
  return db.user.update({
    where: { id },
    data: { extraInfo },
    select: USER_PUBLIC_SELECT,
  });
};

const deleteById = async (id: number) => {
  return db.user.delete({
    where: { id },
  });
};

export { findById, findMany, addUser, updateExtraInfo, deleteById };
