import { LRUCache } from 'lru-cache';

/** In-flight refresh results keyed by old `jti`. Dedupes concurrent rotation for ~3s. */
const tokenCache = new LRUCache<
  string,
  Promise<{ newRefreshToken: string; newAccessToken: string }>
>({
  max: 100000,
  ttl: 3000,
  ttlAutopurge: true,
}) as LRUCache<
  string,
  Promise<{ newRefreshToken: string; newAccessToken: string }>
>;

export default tokenCache;
