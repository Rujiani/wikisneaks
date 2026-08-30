import { db } from '../prisma/db.js';

type CreateUserData = {
  login: string;
  emailHash: string;
  emailPepperVersion: number;
  passwordHash: string;
};

const USER_PUBLIC_SELECT = {
  id: true,
  login: true,
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
    select: { id: true, login: true },
  });
};

const findByAnyEmailHash = async (emailHashes: string[]) => {
  if (emailHashes.length === 0) return null;

  return db.user.findFirst({
    where: { emailHash: { in: emailHashes } },
    select: { id: true, emailHash: true, emailPepperVersion: true },
  });
};

const upgradeEmailHash = async (
  id: number,
  emailHash: string,
  emailPepperVersion: number,
) => {
  return db.user.update({
    where: { id },
    data: { emailHash, emailPepperVersion, isEmailVerified: true },
    select: { id: true, emailPepperVersion: true },
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

export {
  findById,
  findMany,
  addUser,
  findByAnyEmailHash,
  upgradeEmailHash,
  updateExtraInfo,
  deleteById,
};
