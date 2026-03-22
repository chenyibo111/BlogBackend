import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import type { AuthRequest } from '../types';

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
