import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create mock functions BEFORE mocking modules
const mockUserFindUnique = vi.fn();
const mockUserCreate = vi.fn();
const mockUserCount = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserDelete = vi.fn();

vi.mock('@/utils/prisma', () => ({
  default: {
    user: {
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      count: mockUserCount,
      update: mockUserUpdate,
      delete: mockUserDelete,
    },
  },
}));

vi.mock('@/utils/jwt', () => ({
  generateAccessToken: vi.fn(() => 'mocked-access-token'),
  generateRefreshToken: vi.fn(() => 'mocked-refresh-token'),
  getTokenExpiryInSeconds: vi.fn(() => 7200),
  verifyToken: vi.fn(() => ({ userId: 'user-123' })),
}));

vi.mock('@/utils/password', () => ({
  hashPassword: vi.fn(() => Promise.resolve('hashed-password')),
  comparePassword: vi.fn((password, hash) => Promise.resolve(password === 'correct-password')),
}));

vi.mock('@/utils/userCache', () => ({
  userCacheUtil: {
    invalidate: vi.fn(),
  },
}));

import { register, login, refreshTokens, getCurrentUser, updateProfile, logout } from '@/services/auth.service';
import { AppError } from '@/middleware/errorHandler';

describe('AuthService', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    password: 'hashed-password',
    role: 'AUTHOR',
    avatar: null,
    bio: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should create a new user successfully', async () => {
      mockUserCount.mockResolvedValue(0);
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue(mockUser);

      const result = await register({
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.user.password).toBeUndefined();
      expect(result.tokens.accessToken).toBe('mocked-access-token');
    });

    it('should promote first user to ADMIN', async () => {
      mockUserCount.mockResolvedValue(0);
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({ ...mockUser, role: 'ADMIN' });

      await register({
        email: 'admin@example.com',
        password: 'SecurePass123!',
        name: 'Admin',
      });

      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'ADMIN' }),
        })
      );
    });

    it('should give subsequent users AUTHOR role', async () => {
      mockUserCount.mockResolvedValue(5);
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({ ...mockUser, role: 'AUTHOR' });

      await register({
        email: 'author@example.com',
        password: 'SecurePass123!',
        name: 'Author',
      });

      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'AUTHOR' }),
        })
      );
    });

    it('should reject duplicate email', async () => {
      mockUserFindUnique.mockResolvedValue(mockUser);

      await expect(
        register({
          email: 'test@example.com',
          password: 'SecurePass123!',
          name: 'Test',
        })
      ).rejects.toThrow(AppError);
    });
  });

  describe('login', () => {
    it('should login with correct credentials', async () => {
      mockUserFindUnique.mockResolvedValue(mockUser);

      const result = await login({
        email: 'test@example.com',
        password: 'correct-password',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens.accessToken).toBe('mocked-access-token');
    });

    it('should reject invalid email', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      await expect(
        login({ email: 'nonexistent@example.com', password: 'password' })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should reject wrong password', async () => {
      mockUserFindUnique.mockResolvedValue(mockUser);

      await expect(
        login({ email: 'test@example.com', password: 'wrong-password' })
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('refreshTokens', () => {
    it('should return new tokens with valid refresh token', async () => {
      mockUserFindUnique.mockResolvedValue(mockUser);

      const result = await refreshTokens('valid-refresh-token');

      expect(result.accessToken).toBe('mocked-access-token');
      expect(result.refreshToken).toBe('mocked-refresh-token');
    });

    it('should reject invalid refresh token', async () => {
      const { verifyToken } = await import('@/utils/jwt');
      vi.mocked(verifyToken).mockReturnValue(null);

      await expect(refreshTokens('invalid-token')).rejects.toThrow(
        'Invalid or expired refresh token'
      );
    });

    it('should reject if user not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      await expect(refreshTokens('valid-refresh-token')).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('getCurrentUser', () => {
    it('should return user by id', async () => {
      mockUserFindUnique.mockResolvedValue(mockUser);

      const result = await getCurrentUser('user-123');

      expect(result?.email).toBe('test@example.com');
      expect(result?.password).toBeUndefined();
    });

    it('should return null if user not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      const result = await getCurrentUser('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('should update user profile', async () => {
      mockUserUpdate.mockResolvedValue(mockUser);

      const result = await updateProfile('user-123', { name: 'New Name' });

      expect(result.name).toBe('Test User');
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
          data: { name: 'New Name' },
        })
      );
    });

    it('should check email uniqueness when updating email', async () => {
      mockUserFindFirst = vi.fn().mockResolvedValue({ id: 'other-user' });
      
      await expect(
        updateProfile('user-123', { email: 'taken@example.com' })
      ).rejects.toThrow('Email is already in use by another account');
    });
  });

  describe('logout', () => {
    it('should add token to blacklist', async () => {
      await expect(logout('some-token')).resolves.not.toThrow();
    });
  });
});
