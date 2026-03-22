import { Router } from 'express';
import multer from 'multer';
import * as uploadController from '../controllers/upload.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

// All routes require authentication
router.use(authMiddleware);

// Upload file
router.post('/', upload.single('file'), uploadController.uploadFile);

// Get media library
router.get('/', uploadController.getMedia);

// Delete media
router.delete('/:id', uploadController.deleteMedia);

export default router;
