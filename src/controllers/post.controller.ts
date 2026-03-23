import type { Request, Response, NextFunction } from 'express';
import * as postService from '../services/post.service';
import type { AuthRequest, PostFilter } from '../types';

export async function listPosts(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const currentUser = req.user;
    const filter: PostFilter = {
      status: req.query.status as any,
      authorId: req.query.authorId as string,
      categoryId: req.query.categoryId as string,
      search: req.query.search as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      sortBy: (req.query.sortBy as string) || 'publishedAt',
      order: ((req.query.order as any) || 'desc') as 'asc' | 'desc',
    };

    // 权限控制：未登录用户只能看已发布文章
    if (!currentUser) {
      filter.status = 'PUBLISHED';
    } else if (currentUser.role === 'AUTHOR') {
      // 普通作者：如果没指定 authorId，默认只看自己的文章；如果指定了，只能看已发布的
      if (!filter.authorId) {
        filter.authorId = currentUser.id;
      } else if (filter.authorId !== currentUser.id) {
        filter.status = 'PUBLISHED';
      }
    }
    // ADMIN/EDITOR 可以看到所有文章，不做限制

    const posts = await postService.getPosts(filter, currentUser);

    res.json({
      success: true,
      data: posts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPost(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const idParam = req.params.id as string;
    const currentUser = req.user;
    
    // Check if ID is numeric or slug
    const numericId = parseInt(idParam);
    let post;
    
    if (isNaN(numericId)) {
      // It's a slug, find by slug
      post = await postService.getPostBySlug(idParam, currentUser);
    } else {
      // It's a numeric ID
      post = await postService.getPostById(numericId, currentUser);
    }

    res.json({
      success: true,
      data: post,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function createPost(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const authorId = req.user!.id;
    const { title, slug, excerpt, content, coverImage, status, categoryIds } = req.body;

    // Validation
    const errors: string[] = [];
    
    if (!title || typeof title !== 'string') {
      errors.push('Title is required');
    } else if (title.trim().length < 3) {
      errors.push('Title must be at least 3 characters');
    } else if (title.trim().length > 200) {
      errors.push('Title must be less than 200 characters');
    }

    if (!content || typeof content !== 'string') {
      errors.push('Content is required');
    }

    if (excerpt && typeof excerpt === 'string' && excerpt.length > 500) {
      errors.push('Excerpt must be less than 500 characters');
    }

    const validStatuses = ['DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED'];
    if (status && !validStatuses.includes(status)) {
      errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    if (categoryIds && !Array.isArray(categoryIds)) {
      errors.push('Category IDs must be an array');
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: errors.join('; '),
        },
      });
      return;
    }

    const post = await postService.createPost(
      { title: title.trim(), slug, excerpt, content, coverImage, status, categoryIds },
      authorId
    );

    res.status(201).json({
      success: true,
      data: post,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePost(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const currentUser = req.user!;
    const id = parseInt(req.params.id as string);
    const updates = req.body;

    // 检查权限：只能编辑自己的文章（ADMIN/EDITOR 除外）
    const existingPost = await postService.getPostById(id, currentUser);
    if (existingPost.authorId !== currentUser.id && 
        currentUser.role !== 'ADMIN' && 
        currentUser.role !== 'EDITOR') {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only edit your own posts',
        },
      });
      return;
    }

    const post = await postService.updatePost(id, { id, ...updates }, currentUser);

    res.json({
      success: true,
      data: post,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function deletePost(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const currentUser = req.user!;
    const id = parseInt(req.params.id as string);
    
    // 检查权限：只能删除自己的文章（ADMIN/EDITOR 除外）
    const existingPost = await postService.getPostById(id, currentUser);
    if (existingPost.authorId !== currentUser.id && 
        currentUser.role !== 'ADMIN' && 
        currentUser.role !== 'EDITOR') {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only delete your own posts',
        },
      });
      return;
    }

    await postService.deletePost(id, currentUser);

    res.json({
      success: true,
      data: { message: 'Post deleted successfully' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function publishPost(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const currentUser = req.user!;
    const id = parseInt(req.params.id as string);
    
    // 检查权限：只能发布自己的文章（ADMIN/EDITOR 除外）
    const existingPost = await postService.getPostById(id, currentUser);
    if (existingPost.authorId !== currentUser.id && 
        currentUser.role !== 'ADMIN' && 
        currentUser.role !== 'EDITOR') {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only publish your own posts',
        },
      });
      return;
    }

    const post = await postService.publishPost(id);

    res.json({
      success: true,
      data: post,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function unpublishPost(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const currentUser = req.user!;
    const id = parseInt(req.params.id as string);
    
    // 检查权限：只能取消发布自己的文章（ADMIN/EDITOR 除外）
    const existingPost = await postService.getPostById(id, currentUser);
    if (existingPost.authorId !== currentUser.id && 
        currentUser.role !== 'ADMIN' && 
        currentUser.role !== 'EDITOR') {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only unpublish your own posts',
        },
      });
      return;
    }

    const post = await postService.unpublishPost(id);

    res.json({
      success: true,
      data: post,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getArchive(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const archive = await postService.getArchive(req.user);

    res.json({
      success: true,
      data: archive,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
