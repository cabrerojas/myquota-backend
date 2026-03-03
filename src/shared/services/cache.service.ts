/**
 * Simple in-memory cache with TTL support.
 * Used to reduce Firestore reads for frequently-accessed, slowly-changing data.
 *
 * Each cache entry is keyed by a string and holds a value with an expiration time.
 * When the TTL expires, the next `get()` returns null and the caller fetches fresh data.
 *
 * Usage:
 *   const cached = CacheService.get<MyType>(key);
 *   if (cached) return cached;
 *   const fresh = await expensiveFirestoreQuery();
 *   CacheService.set(key, fresh, 300); // cache for 5 min
 *   return fresh;
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class CacheServiceImpl {
  private store = new Map<string, CacheEntry<unknown>>();

  /** Get a cached value. Returns null if expired or not found. */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  /** Set a value in the cache with a TTL in seconds. */
  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /** Invalidate a specific key. */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Invalidate all keys matching a prefix (e.g., "user:abc:" invalidates all for that user). */
  invalidateByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /** Clear all cached entries. */
  clear(): void {
    this.store.clear();
  }

  /** Get current cache size (for monitoring). */
  size(): number {
    return this.store.size;
  }
}

/** Singleton cache instance shared across the application. */
export const CacheService = new CacheServiceImpl();

/** Standard TTLs in seconds */
export const CacheTTL = {
  /** For data that rarely changes (categories, debt summary) */
  LONG: 300, // 5 minutes
  /** For data that changes moderately (monthly stats, uncategorized count) */
  MEDIUM: 120, // 2 minutes
  /** For data that changes often but still benefits from brief caching */
  SHORT: 30, // 30 seconds
} as const;

/** Helper to build consistent cache keys */
export const CacheKeys = {
  debtSummary: (userId: string): string => `user:${userId}:debt-summary`,
  monthlyStats: (userId: string, creditCardId: string): string =>
    `user:${userId}:cc:${creditCardId}:monthly-stats`,
  uncategorizedCount: (userId: string): string =>
    `user:${userId}:uncategorized-count`,
  globalCategories: (): string => `global:categories`,
  userCategories: (userId: string): string => `user:${userId}:categories`,
  creditCards: (userId: string): string => `user:${userId}:credit-cards`,
  userPrefix: (userId: string): string => `user:${userId}:`,
} as const;
