import { Router } from 'express';
import * as postController from '../controllers/post.controller';
import { authMiddleware } from '../middleware/auth';
import { optionalAuthMiddleware } from '../middleware/auth';

const router = Router();

// Public routes (with optional auth for permission-based filtering)
router.get('/', optionalAuthMiddleware, postController.listPosts);
router.get('/archive', optionalAuthMiddleware, postController.getArchive);
router.get('/:id', optionalAuthMiddleware, postController.getPost);

// Protected routes
router.post('/', authMiddleware, postController.createPost);
router.patch('/:id', authMiddleware, postController.updatePost);
router.delete('/:id', authMiddleware, postController.deletePost);
router.post('/:id/publish', authMiddleware, postController.publishPost);
router.post('/:id/unpublish', authMiddleware, postController.unpublishPost);

export default router;
