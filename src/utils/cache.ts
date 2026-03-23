/**
 * Simple in-memory cache with TTL support
 * For production, consider using Redis for distributed caching
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value as T;
  }

  /**
   * Set a value in cache with TTL in seconds
   */
  set<T>(key: string, value: T, ttlSeconds: number = 60): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Delete a value from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all keys matching a pattern
   */
  deletePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export const cache = new MemoryCache();

/**
 * Cache key generators for consistent naming
 */
export const CacheKeys = {
  post: (id: number) => `post:${id}`,
  postBySlug: (slug: string) => `post:slug:${slug}`,
  postsList: (filter: string) => `posts:list:${filter}`,
  archive: () => 'posts:archive',
  authorPosts: (authorId: string, page: number) => `posts:author:${authorId}:${page}`,
};

/**
 * Cache TTL presets (in seconds)
 */
export const CacheTTL = {
  SHORT: 30,        // 30 seconds - for rapidly changing data
  MEDIUM: 60,       // 1 minute - for moderately changing data
  LONG: 300,        // 5 minutes - for relatively stable data
  VERY_LONG: 3600,  // 1 hour - for rarely changing data
};