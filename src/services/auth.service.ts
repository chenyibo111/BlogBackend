import prisma from '../utils/prisma';
import { hashPassword, comparePassword } from '../utils/password';
import { generateAccessToken, generateRefreshToken, getTokenExpiryInSeconds } from '../utils/jwt';
import type { RegisterInput, LoginInput, AuthResponse, UserPublic } from '../types';
import { AppError } from '../middleware/errorHandler';

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

  // Hash password
  const hashedPassword = await hashPassword(input.password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      password: hashedPassword,
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
  data: { name?: string; bio?: string; avatar?: string }
): Promise<UserPublic> {
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

  return toUserPublic(user);
}
