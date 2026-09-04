import { db } from '../prisma/db.js';

type CreateUserData = {
  login: string;
  passwordHash: string;
  emailHash?: string | null;
  emailPepperVersion?: number | null;
};

/** Fields safe to return from the API (no password or email fingerprint). */
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
    select: USER_PUBLIC_SELECT,
  });
};

/**
 * Find a user whose `email_hash` matches any of the candidate digests
 * (typically one digest per live pepper version).
 */
const findByAnyEmailHash = async (emailHashes: string[]) => {
  if (emailHashes.length === 0) return null;

  return db.user.findFirst({
    where: { emailHash: { in: emailHashes } },
    select: { id: true, emailHash: true, emailPepperVersion: true },
  });
};

/**
 * Rewrite email fingerprint under a new pepper version.
 * Also sets `isEmailVerified` (see auth.service `reconfirmEmail` docs).
 */
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

const setBlocked = async (id: number, isBlocked: boolean) => {
  if (isBlocked) {
    await db.token.deleteMany({
      where: { userId: id },
    });
  }

  return db.user.update({
    where: { id },
    data: { isBlocked },
    select: USER_PUBLIC_SELECT,
  });
};

/** Login lookup: public fields plus password hash. Do not return this from the API. */
const findByLoginWithHash = async (login: string) => {
  return db.user.findUnique({
    where: { login },
    select: {
      ...USER_PUBLIC_SELECT,
      passwordHash: true,
    },
  });
};

const findByLogin = async (login: string) => {
  return db.user.findUnique({
    where: { login },
    select: USER_PUBLIC_SELECT,
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
  setBlocked,
  findByLoginWithHash,
  findByLogin,
};
