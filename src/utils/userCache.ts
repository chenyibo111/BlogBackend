/**
 * User Cache - 缓存用户信息，减少数据库查询
 * 解决 #18: Auth 中间件每次查 DB
 */

import type { UserPublic } from '../types';

interface CacheEntry {
  user: UserPublic;
  expiresAt: number;
}

// 内存缓存，5分钟过期
const CACHE_TTL_MS = 5 * 60 * 1000;
const userCache = new Map<string, CacheEntry>();

// 定期清理过期缓存
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of userCache.entries()) {
    if (entry.expiresAt < now) {
      userCache.delete(key);
    }
  }
}, 60 * 1000); // 每分钟清理一次

export const userCacheUtil = {
  get(userId: string): UserPublic | null {
    const entry = userCache.get(userId);
    if (!entry) return null;
    
    if (entry.expiresAt < Date.now()) {
      userCache.delete(userId);
      return null;
    }
    
    return entry.user;
  },

  set(userId: string, user: UserPublic): void {
    userCache.set(userId, {
      user,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  },

  delete(userId: string): void {
    userCache.delete(userId);
  },

  // 用户信息更新时清除缓存
  invalidate(userId: string): void {
    userCache.delete(userId);
  },

  // 获取缓存统计
  stats() {
    return {
      size: userCache.size,
      entries: Array.from(userCache.entries()).map(([key, entry]) => ({
        userId: key,
        expiresAt: new Date(entry.expiresAt).toISOString(),
      })),
    };
  },
};