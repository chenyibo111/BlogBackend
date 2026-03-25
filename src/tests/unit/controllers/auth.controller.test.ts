import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '@/types';
import * as authController from '@/controllers/auth.controller';
import * as authService from '@/services/auth.service';

// Mock auth service
vi.mock('../../services/auth.service', () => ({
  register: vi.fn(),
  login: vi.fn(),
  getCurrentUser: vi.fn(),
  updateProfile: vi.fn(),
  refreshTokens: vi.fn(),
  logout: vi.fn(),
}));

describe('Auth Controller', () => {
  let mockRequest: Partial<Request & AuthRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'AUTHOR',
  };

  const mockAuthResult = {
    user: mockUser,
    tokens: {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 7200,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockRequest = {
      body: {},
      cookies: {},
      headers: {},
      user: mockUser,
    };
    
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    };
    
    nextFunction = vi.fn();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      vi.mocked(authService.register).mockResolvedValue(mockAuthResult);
      
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
      };

      await authController.register(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(authService.register).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockAuthResult,
        })
      );
    });

    it('should reject missing email', async () => {
      mockRequest.body = { password: 'password', name: 'Name' };

      await authController.register(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Email, password, and name are required',
          }),
        })
      );
    });

    it('should reject missing password', async () => {
      mockRequest.body = { email: 'test@example.com', name: 'Name' };

      await authController.register(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should reject missing name', async () => {
      mockRequest.body = { email: 'test@example.com', password: 'password' };

      await authController.register(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should pass errors to next middleware', async () => {
      vi.mocked(authService.register).mockRejectedValue(new Error('DB error'));
      
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password',
        name: 'Name',
      };

      await authController.register(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('login', () => {
    it('should login successfully', async () => {
      vi.mocked(authService.login).mockResolvedValue(mockAuthResult);
      
      mockRequest.body = {
        email: 'test@example.com',
        password: 'correct-password',
      };

      await authController.login(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(authService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'correct-password',
        rememberMe: undefined,
      });
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should reject missing email', async () => {
      mockRequest.body = { password: 'password' };

      await authController.login(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Email and password are required',
          }),
        })
      );
    });

    it('should reject missing password', async () => {
      mockRequest.body = { email: 'test@example.com' };

      await authController.login(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should handle rememberMe option', async () => {
      vi.mocked(authService.login).mockResolvedValue(mockAuthResult);
      
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password',
        rememberMe: true,
      };

      await authController.login(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(authService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password',
        rememberMe: true,
      });
    });
  });

  describe('getMe', () => {
    it('should return current user', async () => {
      vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser);
      
      mockRequest.user = { id: 'user-123' };

      await authController.getMe(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(authService.getCurrentUser).toHaveBeenCalledWith('user-123');
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockUser,
        })
      );
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(authService.getCurrentUser).mockResolvedValue(null);
      
      mockRequest.user = { id: 'user-123' };

      await authController.getMe(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'User not found',
          }),
        })
      );
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      vi.mocked(authService.updateProfile).mockResolvedValue(mockUser);
      
      mockRequest.user = { id: 'user-123' };
      mockRequest.body = { name: 'New Name', bio: 'New bio' };

      await authController.updateProfile(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(authService.updateProfile).toHaveBeenCalledWith('user-123', {
        name: 'New Name',
        bio: 'New bio',
        avatar: undefined,
      });
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockUser,
        })
      );
    });
  });

  describe('refreshToken', () => {
    it('should refresh tokens from cookie', async () => {
      vi.mocked(authService.refreshTokens).mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 7200,
      });
      
      mockRequest.cookies = { refreshToken: 'old-refresh' };

      await authController.refreshToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(authService.refreshTokens).toHaveBeenCalledWith('old-refresh');
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should refresh tokens from body', async () => {
      vi.mocked(authService.refreshTokens).mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 7200,
      });
      
      mockRequest.body = { refreshToken: 'body-refresh' };

      await authController.refreshToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(authService.refreshTokens).toHaveBeenCalledWith('body-refresh');
    });

    it('should reject missing refresh token', async () => {
      await authController.refreshToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Refresh token is required',
          }),
        })
      );
    });
  });

  describe('logout', () => {
    it('should logout successfully with cookie token', async () => {
      mockRequest.cookies = { accessToken: 'token' };

      await authController.logout(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(authService.logout).toHaveBeenCalledWith('token');
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('accessToken', { path: '/' });
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('refreshToken', { path: '/' });
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should logout successfully with header token', async () => {
      mockRequest.headers = { authorization: 'Bearer header-token' };

      await authController.logout(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(authService.logout).toHaveBeenCalledWith('header-token');
    });

    it('should handle logout without token gracefully', async () => {
      await authController.logout(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      // Should still clear cookies and return success
      expect(mockResponse.clearCookie).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });
});
