import path from 'path';
import fs from 'fs';
import prisma from '../utils/prisma';
import { hashPassword, comparePassword } from '../utils/password';
import { generateAccessToken, generateRefreshToken, getTokenExpiryInSeconds, verifyToken } from '../utils/jwt';
import { userCacheUtil } from '../utils/userCache';
import type { RegisterInput, LoginInput, AuthResponse, UserPublic } from '../types';
import { AppError } from '../middleware/errorHandler';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

function toUserPublic(user: any): UserPublic {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    bio: user.bio,
    role: user.role as any,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    throw new AppError('Email already registered', 409, 'CONFLICT');
  }

  // Check if this is the first user (auto-promote to ADMIN)
  const userCount = await prisma.user.count();
  const role = userCount === 0 ? 'ADMIN' : 'AUTHOR';

  // Hash password
  const hashedPassword = await hashPassword(input.password);

  // Create user with appropriate role
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      password: hashedPassword,
      role,
    },
  });

  // Generate tokens
  const userPublic = toUserPublic(user);
  const accessToken = generateAccessToken(userPublic);
  const refreshToken = generateRefreshToken(userPublic);

  return {
    user: userPublic,
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: getTokenExpiryInSeconds(accessToken),
    },
  };
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  // Find user
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }

  // Verify password
  const isValid = await comparePassword(input.password, user.password);

  if (!isValid) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }

  // Generate tokens
  const userPublic = toUserPublic(user);
  const accessToken = generateAccessToken(userPublic);
  const refreshToken = generateRefreshToken(userPublic);

  return {
    user: userPublic,
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: getTokenExpiryInSeconds(accessToken),
    },
  };
}

export async function refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  // Verify the refresh token
  const payload = verifyToken(refreshToken);
  
  if (!payload) {
    throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHORIZED');
  }

  // Check if user still exists
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!user) {
    throw new AppError('User not found', 401, 'UNAUTHORIZED');
  }

  // Generate new tokens
  const userPublic = toUserPublic(user);
  const newAccessToken = generateAccessToken(userPublic);
  const newRefreshToken = generateRefreshToken(userPublic);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: getTokenExpiryInSeconds(newAccessToken),
  };
}

export async function getCurrentUser(userId: string): Promise<UserPublic | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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

  return user ? toUserPublic(user) : null;
}

export async function updateProfile(
  userId: string,
  data: { name?: string; bio?: string; avatar?: string; email?: string }
): Promise<UserPublic> {
  // If email is being updated, check for duplicates
  if (data.email) {
    const existingUser = await prisma.user.findFirst({
      where: {
        email: data.email,
        NOT: { id: userId },
      },
    });

    if (existingUser) {
      throw new AppError('Email is already in use by another account', 409, 'CONFLICT');
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
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

  // Invalidate user cache (#18: 用户信息更新时清除缓存)
  userCacheUtil.invalidate(userId);

  return toUserPublic(user);
}

/**
 * Delete user account and all associated files
 * Fixes #29: Ensures files are cleaned up when user is deleted
 */
export async function deleteAccount(userId: string): Promise<void> {
  // 1. Get all media files uploaded by this user
  const mediaFiles = await prisma.media.findMany({
    where: { uploadedById: userId },
    select: { filename: true },
  });

  // 2. Delete all physical files first
  // We do this BEFORE database deletion to avoid orphan files if DB fails
  const deleteErrors: string[] = [];
  for (const media of mediaFiles) {
    try {
      const filepath = path.join(UPLOAD_DIR, media.filename);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    } catch (error) {
      // Log but continue - we'll report all failures at the end
      deleteErrors.push(media.filename);
    }
  }

  // 3. Delete user (cascade will handle media records in DB)
  await prisma.user.delete({
    where: { id: userId },
  });

  // 4. Report any file deletion errors (non-critical, data is cleaned)
  if (deleteErrors.length > 0) {
    console.error(`[Account] User ${userId} deleted, but some files failed to delete:`, deleteErrors);
    // Could add to cleanup queue for later retry
  }
}

/**
 * Logout - add token to blacklist
 */
export async function logout(token: string): Promise<void> {
  const { tokenBlacklist } = await import('../utils/tokenBlacklist');
  const jwt = await import('jsonwebtoken');
  
  // Get token expiry
  const decoded = jwt.decode(token) as any;
  const expiresAt = decoded?.exp || Math.floor(Date.now() / 1000) + 7200; // Default 2 hours
  
  tokenBlacklist.add(token, expiresAt);
}
