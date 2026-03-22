import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../types';

// 角色权限级别
const ROLE_LEVELS: Record<string, number> = {
  ADMIN: 3,
  EDITOR: 2,
  AUTHOR: 1,
};

/**
 * 检查用户角色是否达到最低要求
 * @param minRole - 最低要求的角色
 */
export function requireRole(minRole: string) {
  return (req: Request & AuthRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }
    
    const userLevel = ROLE_LEVELS[user.role] || 0;
    const requiredLevel = ROLE_LEVELS[minRole] || 0;
    
    if (userLevel < requiredLevel) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Insufficient permissions. Required: ${minRole}`,
        },
      });
      return;
    }
    
    next();
  };
}

/**
 * 检查用户是否拥有指定资源的所有权
 * @param getResourceOwnerId - 获取资源所有者 ID 的函数
 */
export function requireOwnership(getResourceOwnerId: (req: Request) => Promise<string | null>) {
  return async (req: Request & AuthRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }
    
    // ADMIN 和 EDITOR 可以操作任何资源
    if (user.role === 'ADMIN' || user.role === 'EDITOR') {
      next();
      return;
    }
    
    try {
      const ownerId = await getResourceOwnerId(req);
      
      if (!ownerId) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Resource not found',
          },
        });
        return;
      }
      
      if (ownerId !== user.id) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only modify your own resources',
          },
        });
        return;
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * 检查用户是否是作者（普通用户）
 */
export function requireAuthor(req: Request & AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return;
  }
  
  if (req.user.role !== 'AUTHOR' && req.user.role !== 'EDITOR' && req.user.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Invalid user role',
      },
    });
    return;
  }
  
  next();
}
