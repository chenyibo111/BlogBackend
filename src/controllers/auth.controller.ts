import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import type { AuthRequest } from '../types';

// #12: Cookie 配置
const isProduction = process.env.NODE_ENV === 'production';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email, password, and name are required',
        },
      });
      return;
    }

    const result = await authService.register({ email, password, name });

    // #12: 设置 HttpOnly Cookie
    res.cookie('accessToken', result.tokens.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: result.tokens.expiresIn * 1000,
    });
    res.cookie('refreshToken', result.tokens.refreshToken, COOKIE_OPTIONS);

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, rememberMe } = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required',
        },
      });
      return;
    }

    const result = await authService.login({ email, password, rememberMe });

    // #12: 设置 HttpOnly Cookie
    res.cookie('accessToken', result.tokens.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: result.tokens.expiresIn * 1000,
    });
    res.cookie('refreshToken', result.tokens.refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000, // 30 days or 7 days
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;

    const user = await authService.getCurrentUser(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { name, bio, avatar } = req.body;

    const user = await authService.updateProfile(userId, { name, bio, avatar });

    res.json({
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadAvatar(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No file uploaded',
        },
      });
      return;
    }

    // Validate file
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: 'Only image files are allowed',
        },
      });
      return;
    }

    if (req.file.size > 5 * 1024 * 1024) {
      res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File size must be less than 5MB',
        },
      });
      return;
    }

    // Save avatar using upload service
    const uploadService = await import('../services/upload.service');
    const result = await uploadService.saveFile(req.file, userId);

    // Update user avatar
    const authService = await import('../services/auth.service');
    const user = await authService.updateProfile(userId, { avatar: result.url });

    res.json({
      success: true,
      data: { user, url: result.url },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    // #12: 支持从 Cookie 或 Body 获取 refresh token
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Refresh token is required',
        },
      });
      return;
    }

    const tokens = await authService.refreshTokens(refreshToken);

    // #12: 更新 HttpOnly Cookie
    res.cookie('accessToken', tokens.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: tokens.expiresIn * 1000,
    });
    res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS);

    res.json({
      success: true,
      data: tokens,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    // #12: 支持从 Cookie 或 Header 获取 token
    const authHeader = req.headers.authorization;
    const token = authHeader?.substring(7) || req.cookies?.accessToken;
    
    if (token) {
      await authService.logout(token);
    }

    // #12: 清除 Cookie
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });

    res.json({
      success: true,
      data: { message: 'Logged out successfully' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
