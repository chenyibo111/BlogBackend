import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { tokenBlacklist } from '../utils/tokenBlacklist';
import { userCacheUtil } from '../utils/userCache';
import prisma from '../utils/prisma';
import type { AuthRequest, UserPublic } from '../types';

export async function authMiddleware(
  req: Request & AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // #12: 支持从 Header 或 Cookie 获取 token
    const authHeader = req.headers.authorization;
    let token: string | undefined;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies?.accessToken) {
      // Fallback to HttpOnly cookie
      token = req.cookies.accessToken;
    }
    
    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'No token provided',
        },
      });
      return;
    }
    
    // Check if token is blacklisted
    if (tokenBlacklist.isBlacklisted(token)) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Token has been revoked',
        },
      });
      return;
    }
    
    const payload = verifyToken(token);
    
    if (!payload) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        },
      });
      return;
    }
    
    // Check cache first (#18: Auth 中间件缓存优化)
    let user = userCacheUtil.get(payload.userId);
    
    if (!user) {
      // Cache miss, fetch from database
      const dbUser = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          bio: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      
      if (!dbUser) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not found',
          },
        });
        return;
      }
      
      user = dbUser as UserPublic;
      userCacheUtil.set(payload.userId, user);
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication failed',
      },
    });
  }
}

export function optionalAuthMiddleware(
  req: Request & AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  // #12: 支持从 Header 或 Cookie 获取 token
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }
  
  if (token) {
    const payload = verifyToken(token);
    
    if (payload) {
      prisma.user
        .findUnique({
          where: { id: payload.userId },
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            bio: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        })
        .then((user) => {
          if (user) {
            req.user = user as UserPublic;
          }
          next();
        })
        .catch(() => next());
      return;
    }
  }
  
  next();
}
