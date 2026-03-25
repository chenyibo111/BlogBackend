import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '@/types';
import * as postController from '@/controllers/post.controller';
import * as postService from '@/services/post.service';

// Mock post service
vi.mock('../../services/post.service', () => ({
  getPosts: vi.fn(),
  getPostById: vi.fn(),
  getPostBySlug: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  publishPost: vi.fn(),
  unpublishPost: vi.fn(),
  getArchive: vi.fn(),
}));

describe('Post Controller', () => {
  let mockRequest: Partial<Request & AuthRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  const mockUser = {
    id: 'user-123',
    email: 'user@example.com',
    name: 'Test User',
    role: 'AUTHOR',
  };

  const mockAdmin = {
    id: 'admin-123',
    email: 'admin@example.com',
    name: 'Admin',
    role: 'ADMIN',
  };

  const mockPost = {
    id: 1,
    slug: 'test-post',
    title: 'Test Post',
    content: 'Content',
    status: 'PUBLISHED',
    authorId: 'user-123',
    publishedAt: new Date(),
    createdAt: new Date(),
    author: mockUser,
    categories: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockRequest = {
      params: {},
      query: {},
      body: {},
      user: mockUser,
    };
    
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    
    nextFunction = vi.fn();
  });

  describe('listPosts', () => {
    it('should return paginated posts', async () => {
      vi.mocked(postService.getPosts).mockResolvedValue({
        items: [mockPost],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      await postController.listPosts(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.getPosts).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            items: expect.any(Array),
          }),
        })
      );
    });

    it('should filter to published only for unauthenticated user', async () => {
      mockRequest.user = undefined;
      vi.mocked(postService.getPosts).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await postController.listPosts(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.getPosts).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PUBLISHED',
        }),
        undefined
      );
    });

    it('should default to user own posts for AUTHOR role', async () => {
      vi.mocked(postService.getPosts).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await postController.listPosts(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.getPosts).toHaveBeenCalledWith(
        expect.objectContaining({
          authorId: 'user-123',
        }),
        mockUser
      );
    });

    it('should support cursor pagination', async () => {
      mockRequest.query = { cursor: '10', limit: '10' };
      vi.mocked(postService.getPosts).mockResolvedValue({
        items: [],
        total: 0,
        nextCursor: '5',
        hasMore: true,
      });

      await postController.listPosts(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.getPosts).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: '10',
          limit: 10,
        }),
        mockUser
      );
    });
  });

  describe('getPost', () => {
    it('should get post by numeric ID', async () => {
      vi.mocked(postService.getPostById).mockResolvedValue(mockPost);
      mockRequest.params = { id: '1' };

      await postController.getPost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.getPostById).toHaveBeenCalledWith(1, mockUser);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockPost,
        })
      );
    });

    it('should get post by slug', async () => {
      vi.mocked(postService.getPostBySlug).mockResolvedValue(mockPost);
      mockRequest.params = { id: 'my-post-slug' };

      await postController.getPost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.getPostBySlug).toHaveBeenCalledWith('my-post-slug', mockUser);
    });
  });

  describe('createPost', () => {
    it('should create post successfully', async () => {
      vi.mocked(postService.createPost).mockResolvedValue(mockPost);
      mockRequest.body = {
        title: 'New Post',
        content: 'Content here',
        status: 'DRAFT',
      };

      await postController.createPost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.createPost).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should reject missing title', async () => {
      mockRequest.body = { content: 'Content' };

      await postController.createPost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('Title'),
          }),
        })
      );
    });

    it('should reject title too short', async () => {
      mockRequest.body = { title: 'AB', content: 'Content' };

      await postController.createPost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('3 characters'),
          }),
        })
      );
    });

    it('should reject title too long', async () => {
      mockRequest.body = { title: 'A'.repeat(201), content: 'Content' };

      await postController.createPost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('200 characters'),
          }),
        })
      );
    });

    it('should reject missing content', async () => {
      mockRequest.body = { title: 'Valid Title' };

      await postController.createPost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('Content'),
          }),
        })
      );
    });

    it('should reject invalid status', async () => {
      mockRequest.body = {
        title: 'Title',
        content: 'Content',
        status: 'INVALID',
      };

      await postController.createPost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('Status'),
          }),
        })
      );
    });

    it('should reject invalid categoryIds type', async () => {
      mockRequest.body = {
        title: 'Title',
        content: 'Content',
        categoryIds: 'not-an-array',
      };

      await postController.createPost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });

  describe('updatePost', () => {
    it('should update post successfully', async () => {
      vi.mocked(postService.getPostById).mockResolvedValue(mockPost);
      vi.mocked(postService.updatePost).mockResolvedValue(mockPost);
      mockRequest.params = { id: '1' };
      mockRequest.body = { title: 'Updated' };

      await postController.updatePost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.updatePost).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should allow author to update their post', async () => {
      const myPost = { ...mockPost, authorId: 'user-123' };
      vi.mocked(postService.getPostById).mockResolvedValue(myPost);
      vi.mocked(postService.updatePost).mockResolvedValue(myPost);
      mockRequest.params = { id: '1' };

      await postController.updatePost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.updatePost).toHaveBeenCalled();
    });

    it('should allow ADMIN to update any post', async () => {
      const otherPost = { ...mockPost, authorId: 'other-user' };
      vi.mocked(postService.getPostById).mockResolvedValue(otherPost);
      vi.mocked(postService.updatePost).mockResolvedValue(otherPost);
      mockRequest.user = mockAdmin;
      mockRequest.params = { id: '1' };

      await postController.updatePost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.updatePost).toHaveBeenCalled();
    });

    it('should reject non-author updating others post', async () => {
      const otherPost = { ...mockPost, authorId: 'other-user' };
      vi.mocked(postService.getPostById).mockResolvedValue(otherPost);
      mockRequest.params = { id: '1' };

      await postController.updatePost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'You can only edit your own posts',
          }),
        })
      );
    });
  });

  describe('deletePost', () => {
    it('should delete post successfully', async () => {
      const myPost = { ...mockPost, authorId: 'user-123' };
      vi.mocked(postService.getPostById).mockResolvedValue(myPost);
      vi.mocked(postService.deletePost).mockResolvedValue(undefined);
      mockRequest.params = { id: '1' };

      await postController.deletePost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.deletePost).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should reject non-author deleting others post', async () => {
      const otherPost = { ...mockPost, authorId: 'other-user' };
      vi.mocked(postService.getPostById).mockResolvedValue(otherPost);
      mockRequest.params = { id: '1' };

      await postController.deletePost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'You can only delete your own posts',
          }),
        })
      );
    });
  });

  describe('publishPost', () => {
    it('should publish post successfully', async () => {
      const myPost = { ...mockPost, authorId: 'user-123' };
      vi.mocked(postService.getPostById).mockResolvedValue(myPost);
      vi.mocked(postService.publishPost).mockResolvedValue(myPost);
      mockRequest.params = { id: '1' };

      await postController.publishPost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.publishPost).toHaveBeenCalled();
    });
  });

  describe('unpublishPost', () => {
    it('should unpublish post successfully', async () => {
      const myPost = { ...mockPost, authorId: 'user-123' };
      vi.mocked(postService.getPostById).mockResolvedValue(myPost);
      vi.mocked(postService.unpublishPost).mockResolvedValue(myPost);
      mockRequest.params = { id: '1' };

      await postController.unpublishPost(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.unpublishPost).toHaveBeenCalled();
    });
  });

  describe('getArchive', () => {
    it('should return archive grouped by year', async () => {
      vi.mocked(postService.getArchive).mockResolvedValue([
        { year: 2024, posts: [mockPost], count: 1 },
      ]);

      await postController.getArchive(
        mockRequest as Request & AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(postService.getArchive).toHaveBeenCalledWith(mockUser);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
        })
      );
    });
  });
});
