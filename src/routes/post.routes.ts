import { Router } from 'express';
import * as postController from '../controllers/post.controller';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { requireOwnership } from '../middleware/permissions';
import prisma from '../utils/prisma';

const router = Router();

// Helper function to get post owner
const getPostOwnerId = async (req: any): Promise<string | null> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return null;
  const post = await prisma.post.findUnique({ 
    where: { id }, 
    select: { authorId: true } 
  });
  return post?.authorId || null;
};

// Public routes (with optional auth for permission-based filtering)
router.get('/', optionalAuthMiddleware, postController.listPosts);
router.get('/archive', optionalAuthMiddleware, postController.getArchive);
router.get('/:id', optionalAuthMiddleware, postController.getPost);

// Protected routes - require authentication
router.post('/', authMiddleware, postController.createPost);

// Update/Delete - require ownership (or ADMIN/EDITOR role)
router.patch(
  '/:id', 
  authMiddleware, 
  requireOwnership(getPostOwnerId), 
  postController.updatePost
);
router.delete(
  '/:id', 
  authMiddleware, 
  requireOwnership(getPostOwnerId), 
  postController.deletePost
);

// Publish/Unpublish - require ownership (or ADMIN/EDITOR role)
router.post(
  '/:id/publish', 
  authMiddleware, 
  requireOwnership(getPostOwnerId), 
  postController.publishPost
);
router.post(
  '/:id/unpublish', 
  authMiddleware, 
  requireOwnership(getPostOwnerId), 
  postController.unpublishPost
);

export default router;
