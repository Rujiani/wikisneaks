import { createHmac } from 'node:crypto';

/**
 * Email hashing with versioned HMAC peppers.
 *
 * Plaintext emails are never stored. Callers must pass a normalized address
 * (trim + lowercase). Registration does **not** use these helpers yet — email
 * binding is optional and wired later.
 *
 * Env:
 * - `EMAIL_HASH_PEPPERS` — JSON object `{ "1": "secret", "2": "…" }`
 * - `EMAIL_HASH_PEPPER_CURRENT` — version used for new hashes (optional; defaults to max key)
 * - `EMAIL_HASH_PEPPER` — legacy single secret (treated as version 1)
 *
 * Keep old pepper versions in env until every stored row has been upgraded,
 * then remove them. See `docs/email-hashing.md`.
 */

type PepperMap = Map<number, string>;

type EmailHashResult = {
  hash: string;
  pepperVersion: number;
};

let cachedPeppers: PepperMap | null = null;
let cachedCurrentVersion: number | null = null;

/**
 * Parse pepper secrets from environment into a version → secret map.
 *
 * @returns Map of pepper version numbers to secret strings.
 * @throws If env is missing, invalid JSON, or contains bad version/secret values.
 */
const parsePeppers = (): PepperMap => {
  const raw = process.env.EMAIL_HASH_PEPPERS;
  if (raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        'EMAIL_HASH_PEPPERS must be valid JSON, e.g. {"1":"secret"}',
      );
    }

    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        'EMAIL_HASH_PEPPERS must be a JSON object of version → secret',
      );
    }

    const map: PepperMap = new Map();
    for (const [key, value] of Object.entries(parsed)) {
      const version = Number(key);
      if (!Number.isInteger(version) || version < 1) {
        throw new Error(
          `Invalid pepper version "${key}" in EMAIL_HASH_PEPPERS`,
        );
      }
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(
          `Pepper for version ${version} must be a non-empty string`,
        );
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

/**
 * Return the pepper map, parsing env on first use and caching for the process.
 *
 * @returns Cached map of version → pepper secret.
 */
const loadPeppers = (): PepperMap => {
  if (cachedPeppers === null) {
    cachedPeppers = parsePeppers();
  }
  return cachedPeppers;
};

/**
 * Resolve which pepper version is active for new hashes (no cache).
 *
 * @param peppers - Parsed pepper map to validate the chosen version against.
 * @returns Active pepper version number.
 * @throws If `EMAIL_HASH_PEPPER_CURRENT` is set but missing from the map.
 */
const resolveCurrentPepperVersion = (peppers: PepperMap): number => {
  const raw = process.env.EMAIL_HASH_PEPPER_CURRENT;
  const version = raw ? Number(raw) : Math.max(...peppers.keys());

  if (!Number.isInteger(version) || !peppers.has(version)) {
    throw new Error(
      `EMAIL_HASH_PEPPER_CURRENT=${raw ?? '(unset)'} is missing from EMAIL_HASH_PEPPERS`,
    );
  }

  return version;
};

/**
 * Return the pepper version used for newly written email hashes.
 *
 * @returns Current pepper version (cached after first resolution).
 */
const getCurrentPepperVersion = (): number => {
  if (cachedCurrentVersion === null) {
    cachedCurrentVersion = resolveCurrentPepperVersion(loadPeppers());
  }
  return cachedCurrentVersion;
};

/**
 * HMAC-SHA256(email, pepper) as a hex digest (64 chars).
 *
 * @param email - Normalized email string.
 * @param pepper - Secret for this pepper version.
 * @returns Hex-encoded HMAC digest.
 */
const hashWithPepper = (email: string, pepper: string): string => {
  return createHmac('sha256', pepper).update(email).digest('hex');
};

/**
 * Hash an email under a specific pepper version (defaults to current).
 *
 * @param email - Normalized email string.
 * @param pepperVersion - Optional explicit version; omit to use current.
 * @returns Hash and the version that produced it.
 * @throws If the version is unknown.
 */
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

/**
 * Hash an email under every configured pepper.
 *
 * Used for lookup and uniqueness checks across pepper rotations: a row may
 * still store a hash produced with an older version.
 *
 * @param email - Normalized email string.
 * @returns Results sorted by ascending pepper version.
 */
const hashEmailAllVersions = (email: string): EmailHashResult[] => {
  return [...loadPeppers().entries()]
    .sort(([a], [b]) => a - b)
    .map(([pepperVersion, pepper]) => ({
      hash: hashWithPepper(email, pepper),
      pepperVersion,
    }));
};

/**
 * Whether a stored pepper version differs from the current one.
 *
 * @param pepperVersion - `email_pepper_version` from the database.
 * @returns `true` if the row should be upgraded to the current pepper.
 */
const isStalePepperVersion = (pepperVersion: number): boolean => {
  return pepperVersion !== getCurrentPepperVersion();
};

/**
 * Clear cached env parsing. Intended for tests only.
 */
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
