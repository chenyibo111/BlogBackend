import { Router } from 'express';
import multer from 'multer';
import * as authController from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Configure multer for avatar upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);

// Protected routes
router.post('/logout', authMiddleware, authController.logout);
router.get('/me', authMiddleware, authController.getMe);
router.patch('/profile', authMiddleware, authController.updateProfile);
router.post('/avatar', authMiddleware, upload.single('avatar'), authController.uploadAvatar);

export default router;
