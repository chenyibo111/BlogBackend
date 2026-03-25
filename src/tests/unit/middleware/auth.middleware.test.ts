import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { authMiddleware, optionalAuthMiddleware } from '@/middleware/auth';
import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '@/types';

// Mock JWT
vi.mock('../../utils/jwt', () => ({
  verifyToken: vi.fn(),
}));

// Mock token blacklist
vi.mock('../../utils/tokenBlacklist', () => ({
  tokenBlacklist: {
    isBlacklisted: vi.fn(),
  },
}));

// Mock user cache
vi.mock('../../utils/userCache', () => ({
  userCacheUtil: {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
  },
}));

// Mock Prisma
vi.mock('../../utils/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe('Auth Middleware', () => {
  let mockRequest: Partial<Request & AuthRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'AUTHOR',
    avatar: null,
    bio: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockRequest = {
      headers: {},
      cookies: {},
    };
    
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    
    nextFunction = vi.fn();
  });

  describe('authMiddleware', () => {
    it('should call next with valid token in Authorization header', async () => {
      const { verifyToken } = await import('../../utils/jwt');
      const { userCacheUtil } = await import('../../utils/userCache');
      
      vi.mocked(verifyToken).mockReturnValue({ userId: 'user-123' });
      vi.mocked(userCacheUtil.get).mockReturnValue(mockUser);
      
      mockRequest.headers = { authorization: 'Bearer valid-token' };

      await authMiddleware(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toEqual(mockUser);
    });

    it('should call next with valid token in cookie', async () => {
      const { verifyToken } = await import('../../utils/jwt');
      const { userCacheUtil } = await import('../../utils/userCache');
      
      vi.mocked(verifyToken).mockReturnValue({ userId: 'user-123' });
      vi.mocked(userCacheUtil.get).mockReturnValue(mockUser);
      
      mockRequest.cookies = { accessToken: 'valid-token' };

      await authMiddleware(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toEqual(mockUser);
    });

    it('should return 401 when no token provided', async () => {
      await authMiddleware(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'No token provided',
          }),
        })
      );
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 when token is blacklisted', async () => {
      const { tokenBlacklist } = await import('../../utils/tokenBlacklist');
      vi.mocked(tokenBlacklist.isBlacklisted).mockReturnValue(true);
      
      mockRequest.headers = { authorization: 'Bearer blacklisted-token' };

      await authMiddleware(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Token has been revoked',
          }),
        })
      );
    });

    it('should return 401 when token is invalid', async () => {
      const { verifyToken } = await import('../../utils/jwt');
      vi.mocked(verifyToken).mockReturnValue(null);
      
      mockRequest.headers = { authorization: 'Bearer invalid-token' };

      await authMiddleware(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Invalid or expired token',
          }),
        })
      );
    });

    it('should return 401 when user not found in database', async () => {
      const { verifyToken } = await import('../../utils/jwt');
      const { userCacheUtil } = await import('../../utils/userCache');
      const prisma = await import('../../utils/prisma');
      
      vi.mocked(verifyToken).mockReturnValue({ userId: 'user-123' });
      vi.mocked(userCacheUtil.get).mockReturnValue(null);
      vi.mocked(prisma.default.user.findUnique).mockResolvedValue(null);
      
      mockRequest.headers = { authorization: 'Bearer valid-token' };

      await authMiddleware(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'User not found',
          }),
        })
      );
    });

    it('should use cached user when available', async () => {
      const { verifyToken } = await import('../../utils/jwt');
      const { userCacheUtil } = await import('../../utils/userCache');
      
      vi.mocked(verifyToken).mockReturnValue({ userId: 'user-123' });
      vi.mocked(userCacheUtil.get).mockReturnValue(mockUser);
      
      mockRequest.headers = { authorization: 'Bearer valid-token' };

      await authMiddleware(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(userCacheUtil.get).toHaveBeenCalledWith('user-123');
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should fetch user from database when cache miss', async () => {
      const { verifyToken } = await import('../../utils/jwt');
      const { userCacheUtil } = await import('../../utils/userCache');
      const prisma = await import('../../utils/prisma');
      
      vi.mocked(verifyToken).mockReturnValue({ userId: 'user-123' });
      vi.mocked(userCacheUtil.get).mockReturnValue(null);
      vi.mocked(prisma.default.user.findUnique).mockResolvedValue(mockUser);
      
      mockRequest.headers = { authorization: 'Bearer valid-token' };

      await authMiddleware(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(prisma.default.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
        })
      );
      expect(userCacheUtil.set).toHaveBeenCalledWith('user-123', mockUser);
    });
  });

  describe('optionalAuthMiddleware', () => {
    it('should attach user with valid token', async () => {
      const { verifyToken } = await import('../../utils/jwt');
      vi.mocked(verifyToken).mockReturnValue({ userId: 'user-123' });
      
      const prisma = await import('../../utils/prisma');
      vi.mocked(prisma.default.user.findUnique).mockResolvedValue(mockUser);
      
      mockRequest.headers = { authorization: 'Bearer valid-token' };

      await optionalAuthMiddleware(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockRequest.user).toEqual(mockUser);
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should call next without user when no token', async () => {
      await optionalAuthMiddleware(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toBeUndefined();
    });

    it('should call next without user when token is invalid', async () => {
      const { verifyToken } = await import('../../utils/jwt');
      vi.mocked(verifyToken).mockReturnValue(null);
      
      mockRequest.headers = { authorization: 'Bearer invalid-token' };

      await optionalAuthMiddleware(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toBeUndefined();
    });

    it('should call next even if user fetch fails', async () => {
      const { verifyToken } = await import('../../utils/jwt');
      const prisma = await import('../../utils/prisma');
      
      vi.mocked(verifyToken).mockReturnValue({ userId: 'user-123' });
      vi.mocked(prisma.default.user.findUnique).mockRejectedValue(new Error('DB error'));
      
      mockRequest.headers = { authorization: 'Bearer valid-token' };

      await optionalAuthMiddleware(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      // Should not throw, just call next
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(nextFunction).toHaveBeenCalled();
    });
  });
});
