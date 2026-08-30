import { afterEach, describe, expect, it } from 'vitest';

import {
  getCurrentPepperVersion,
  hashEmail,
  hashEmailAllVersions,
  isStalePepperVersion,
  resetPepperCache,
} from '../src/utils/hash.email.js';

describe('hashEmail pepper versions', () => {
  afterEach(() => {
    resetPepperCache();
    delete process.env.EMAIL_HASH_PEPPER;
    process.env.EMAIL_HASH_PEPPERS = JSON.stringify({
      '1': 'test-email-hash-pepper-v1',
      '2': 'test-email-hash-pepper-v2',
    });
    process.env.EMAIL_HASH_PEPPER_CURRENT = '2';
  });

  it('hashes with the current pepper version by default', () => {
    const result = hashEmail('user@example.test');

    expect(result.pepperVersion).toBe(2);
    expect(result.hash).toBe(hashEmail('user@example.test', 2).hash);
    expect(result.hash).not.toBe(hashEmail('user@example.test', 1).hash);
  });

  it('returns a candidate for every configured pepper', () => {
    const all = hashEmailAllVersions('user@example.test');

    expect(all).toHaveLength(2);
    expect(all.map((item) => item.pepperVersion)).toEqual([1, 2]);
    expect(all[0]?.hash).not.toBe(all[1]?.hash);
  });

  it('reports stale pepper versions after rotation', () => {
    expect(getCurrentPepperVersion()).toBe(2);
    expect(isStalePepperVersion(1)).toBe(true);
    expect(isStalePepperVersion(2)).toBe(false);
  });

  it('still supports legacy EMAIL_HASH_PEPPER as version 1', () => {
    delete process.env.EMAIL_HASH_PEPPERS;
    delete process.env.EMAIL_HASH_PEPPER_CURRENT;
    process.env.EMAIL_HASH_PEPPER = 'legacy-pepper';
    resetPepperCache();

    const result = hashEmail('user@example.test');
    expect(result.pepperVersion).toBe(1);
    expect(hashEmailAllVersions('user@example.test')).toHaveLength(1);
  });
});
