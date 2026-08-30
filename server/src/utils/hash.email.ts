import { createHmac } from 'node:crypto';

type PepperMap = Map<number, string>;

type EmailHashResult = {
  hash: string;
  pepperVersion: number;
};

let cachedPeppers: PepperMap | null = null;
let cachedCurrentVersion: number | null = null;

const parsePeppers = (): PepperMap => {
  const raw = process.env.EMAIL_HASH_PEPPERS;
  if (raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('EMAIL_HASH_PEPPERS must be valid JSON, e.g. {"1":"secret"}');
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('EMAIL_HASH_PEPPERS must be a JSON object of version → secret');
    }

    const map: PepperMap = new Map();
    for (const [key, value] of Object.entries(parsed)) {
      const version = Number(key);
      if (!Number.isInteger(version) || version < 1) {
        throw new Error(`Invalid pepper version "${key}" in EMAIL_HASH_PEPPERS`);
      }
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Pepper for version ${version} must be a non-empty string`);
      }
      map.set(version, value);
    }

    if (map.size === 0) {
      throw new Error('EMAIL_HASH_PEPPERS must contain at least one pepper');
    }

    return map;
  }

  // Back-compat: single pepper becomes version 1
  const legacy = process.env.EMAIL_HASH_PEPPER;
  if (legacy) {
    return new Map([[1, legacy]]);
  }

  throw new Error('EMAIL_HASH_PEPPERS is not set');
};

const loadPeppers = (): PepperMap => {
  if (!cachedPeppers) {
    cachedPeppers = parsePeppers();
  }
  return cachedPeppers;
};

const getCurrentPepperVersion = (): number => {
  if (cachedCurrentVersion !== null) {
    return cachedCurrentVersion;
  }

  const peppers = loadPeppers();
  const raw = process.env.EMAIL_HASH_PEPPER_CURRENT;
  const version = raw ? Number(raw) : Math.max(...peppers.keys());

  if (!Number.isInteger(version) || !peppers.has(version)) {
    throw new Error(
      `EMAIL_HASH_PEPPER_CURRENT=${raw ?? '(unset)'} is missing from EMAIL_HASH_PEPPERS`,
    );
  }

  cachedCurrentVersion = version;
  return version;
};

const hashWithPepper = (email: string, pepper: string): string => {
  return createHmac('sha256', pepper).update(email).digest('hex');
};

const hashEmail = (email: string, pepperVersion?: number): EmailHashResult => {
  const version = pepperVersion ?? getCurrentPepperVersion();
  const pepper = loadPeppers().get(version);
  if (!pepper) {
    throw new Error(`Unknown email pepper version ${version}`);
  }

  return {
    hash: hashWithPepper(email, pepper),
    pepperVersion: version,
  };
};

/** Hashes under every configured pepper — needed for lookup / uniqueness across rotations. */
const hashEmailAllVersions = (email: string): EmailHashResult[] => {
  return [...loadPeppers().entries()]
    .sort(([a], [b]) => a - b)
    .map(([pepperVersion, pepper]) => ({
      hash: hashWithPepper(email, pepper),
      pepperVersion,
    }));
};

const isStalePepperVersion = (pepperVersion: number): boolean => {
  return pepperVersion !== getCurrentPepperVersion();
};

/** Test helper — clears cached env parsing between cases. */
const resetPepperCache = (): void => {
  cachedPeppers = null;
  cachedCurrentVersion = null;
};

export {
  hashEmail,
  hashEmailAllVersions,
  getCurrentPepperVersion,
  isStalePepperVersion,
  resetPepperCache,
  type EmailHashResult,
};
