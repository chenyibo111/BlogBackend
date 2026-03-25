import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create mock functions BEFORE mocking modules
const mockPostFindMany = vi.fn();
const mockPostFindUnique = vi.fn();
const mockPostFindFirst = vi.fn();
const mockPostCreate = vi.fn();
const mockPostUpdate = vi.fn();
const mockPostDelete = vi.fn();
const mockPostCount = vi.fn();

// Mock Prisma
vi.mock('@/utils/prisma', () => ({
  default: {
    post: {
      findMany: mockPostFindMany,
      findUnique: mockPostFindUnique,
      findFirst: mockPostFindFirst,
      create: mockPostCreate,
      update: mockPostUpdate,
      delete: mockPostDelete,
      count: mockPostCount,
    },
  },
}));

// Mock cache
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockCacheDelete = vi.fn();
const mockCacheDeletePattern = vi.fn();

vi.mock('@/utils/cache', () => ({
  cache: {
    get: mockCacheGet,
    set: mockCacheSet,
    delete: mockCacheDelete,
    deletePattern: mockCacheDeletePattern,
  },
  CacheKeys: {
    post: (id: number) => `post:${id}`,
    postBySlug: (slug: string) => `post:slug:${slug}`,
    archive: () => 'archive',
  },
  CacheTTL: {
    SHORT: 300,
    MEDIUM: 900,
    LONG: 3600,
  },
}));

// Mock slug generator
vi.mock('@/utils/slug', () => ({
  generateSlug: (title: string) => title.toLowerCase().replace(/\s+/g, '-'),
}));

// Import after mocks
import {
  getPosts,
  getPostById,
  getPostBySlug,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  unpublishPost,
  getArchive,
} from '@/services/post.service';
import { AppError } from '@/middleware/errorHandler';

describe('PostService', () => {
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
    excerpt: 'Test excerpt',
    content: 'Test content',
    status: 'PUBLISHED',
    authorId: 'user-123',
    publishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    author: mockUser,
    categories: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPosts', () => {
    it('should return paginated posts for unauthenticated user (only published)', async () => {
      mockPostFindMany.mockResolvedValue([mockPost]);
      mockPostCount.mockResolvedValue(1);

      const result = await getPosts({ page: 1, limit: 10 }, null);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PUBLISHED' },
        })
      );
    });

    it('should return all posts for ADMIN user', async () => {
      mockPostFindMany.mockResolvedValue([mockPost]);
      mockPostCount.mockResolvedValue(1);

      await getPosts({ page: 1, limit: 10 }, mockAdmin);

      const callArgs = mockPostFindMany.mock.calls[0][0];
      expect(callArgs.where?.status).toBeUndefined();
    });

    it('should support cursor-based pagination', async () => {
      mockPostFindMany.mockResolvedValue([mockPost]);
      mockPostCount.mockResolvedValue(1);

      const result = await getPosts({ cursor: '1', limit: 10 }, null);

      expect(result.nextCursor).toBeDefined();
      expect(result.hasMore).toBeDefined();
    });
  });

  describe('getPostById', () => {
    it('should return published post for unauthenticated user', async () => {
      mockPostFindUnique.mockResolvedValue(mockPost);
      mockCacheGet.mockReturnValue(null);

      const result = await getPostById(1, null);

      expect(result.id).toBe(1);
      expect(result.status).toBe('PUBLISHED');
    });

    it('should return from cache if available', async () => {
      mockCacheGet.mockReturnValue(mockPost);

      const result = await getPostById(1, null);

      expect(mockCacheGet).toHaveBeenCalled();
      expect(result).toBe(mockPost);
    });

    it('should throw 404 for unpublished post (non-author)', async () => {
      const draftPost = { ...mockPost, status: 'DRAFT' };
      mockPostFindUnique.mockResolvedValue(draftPost);
      mockCacheGet.mockReturnValue(null);

      await expect(getPostById(1, null)).rejects.toThrow('Post not found');
    });

    it('should allow author to view their own draft', async () => {
      const draftPost = { ...mockPost, status: 'DRAFT', authorId: 'user-123' };
      mockPostFindUnique.mockResolvedValue(draftPost);
      mockCacheGet.mockReturnValue(null);

      const result = await getPostById(1, mockUser);

      expect(result.status).toBe('DRAFT');
    });

    it('should throw 404 if post not found', async () => {
      mockPostFindUnique.mockResolvedValue(null);

      await expect(getPostById(999, null)).rejects.toThrow('Post not found');
    });
  });

  describe('getPostBySlug', () => {
    it('should return post by slug', async () => {
      mockPostFindUnique.mockResolvedValue(mockPost);
      mockCacheGet.mockReturnValue(null);

      const result = await getPostBySlug('test-post', null);

      expect(result.slug).toBe('test-post');
    });

    it('should cache published posts', async () => {
      mockPostFindUnique.mockResolvedValue(mockPost);
      mockCacheGet.mockReturnValue(null);

      await getPostBySlug('test-post', null);

      expect(mockCacheSet).toHaveBeenCalled();
    });
  });

  describe('createPost', () => {
    it('should create a new post', async () => {
      mockPostFindUnique.mockResolvedValue(null);
      mockPostCreate.mockResolvedValue(mockPost);

      const result = await createPost(
        { title: 'New Post', content: 'Content', status: 'DRAFT' },
        'user-123'
      );

      expect(result.title).toBe('Test Post');
      expect(mockPostCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authorId: 'user-123',
            status: 'DRAFT',
          }),
        })
      );
    });

    it('should auto-generate slug from title', async () => {
      mockPostFindUnique.mockResolvedValue(null);
      mockPostCreate.mockResolvedValue(mockPost);

      await createPost({ title: 'My New Post', content: 'Content' }, 'user-123');

      expect(mockPostCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'my-new-post',
          }),
        })
      );
    });

    it('should ensure slug uniqueness', async () => {
      mockPostFindUnique.mockResolvedValue({ id: 2 });
      mockPostCreate.mockResolvedValue(mockPost);

      await createPost({ title: 'Existing', content: 'Content' }, 'user-123');

      expect(mockPostCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: expect.stringMatching(/existing-\d+/),
          }),
        })
      );
    });
  });

  describe('updatePost', () => {
    it('should update post successfully', async () => {
      mockPostFindUnique.mockResolvedValue({ id: 1, authorId: 'user-123', status: 'DRAFT' });
      mockPostUpdate.mockResolvedValue(mockPost);

      const result = await updatePost(1, { title: 'Updated' }, mockUser);

      expect(result.title).toBe('Test Post');
    });

    it('should allow author to update their post', async () => {
      mockPostFindUnique.mockResolvedValue({ id: 1, authorId: 'user-123', status: 'DRAFT' });
      mockPostUpdate.mockResolvedValue(mockPost);

      await updatePost(1, { title: 'Updated' }, mockUser);

      expect(mockPostUpdate).toHaveBeenCalled();
    });

    it('should allow ADMIN to update any post', async () => {
      mockPostFindUnique.mockResolvedValue({ id: 1, authorId: 'other-user', status: 'DRAFT' });
      mockPostUpdate.mockResolvedValue(mockPost);

      await updatePost(1, { title: 'Updated' }, mockAdmin);

      expect(mockPostUpdate).toHaveBeenCalled();
    });

    it('should reject non-author updating others post', async () => {
      mockPostFindUnique.mockResolvedValue({ id: 1, authorId: 'other-user', status: 'DRAFT' });

      await expect(updatePost(1, { title: 'Updated' }, mockUser)).rejects.toThrow(
        'You can only edit your own posts'
      );
    });

    it('should throw 404 if post not found', async () => {
      mockPostFindUnique.mockResolvedValue(null);

      await expect(updatePost(999, { title: 'Updated' }, mockUser)).rejects.toThrow(
        'Post not found'
      );
    });
  });

  describe('deletePost', () => {
    it('should delete post successfully', async () => {
      mockPostFindUnique.mockResolvedValue({ id: 1, authorId: 'user-123' });
      mockPostDelete.mockResolvedValue(undefined);

      await expect(deletePost(1, mockUser)).resolves.not.toThrow();
    });

    it('should reject non-author deleting others post', async () => {
      mockPostFindUnique.mockResolvedValue({ id: 1, authorId: 'other-user' });

      await expect(deletePost(1, mockUser)).rejects.toThrow(
        'You can only delete your own posts'
      );
    });
  });

  describe('publishPost', () => {
    it('should publish a post', async () => {
      mockPostUpdate.mockResolvedValue({
        ...mockPost,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      });

      const result = await publishPost(1);

      expect(result.status).toBe('PUBLISHED');
    });
  });

  describe('unpublishPost', () => {
    it('should unpublish a post', async () => {
      mockPostUpdate.mockResolvedValue({
        ...mockPost,
        status: 'DRAFT',
        publishedAt: null,
      });

      const result = await unpublishPost(1);

      expect(result.status).toBe('DRAFT');
      expect(result.publishedAt).toBeNull();
    });
  });

  describe('getArchive', () => {
    it('should return posts grouped by year', async () => {
      const posts = [
        {
          id: 1,
          slug: 'post-1',
          title: 'Post 1',
          publishedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
          status: 'PUBLISHED',
        },
      ];
      mockPostFindMany.mockResolvedValue(posts);
      mockCacheGet.mockReturnValue(null);

      const result = await getArchive(null);

      expect(Array.isArray(result)).toBe(true);
      expect(result[0].year).toBe(2024);
      expect(result[0].count).toBe(1);
    });

    it('should only return published posts for unauthenticated user', async () => {
      mockPostFindMany.mockResolvedValue([]);
      mockCacheGet.mockReturnValue(null);

      await getArchive(null);

      expect(mockPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PUBLISHED' },
        })
      );
    });

    it('should return from cache if available', async () => {
      const cachedArchive = [{ year: 2024, posts: [], count: 0 }];
      mockCacheGet.mockReturnValue(cachedArchive);

      const result = await getArchive(null);

      expect(result).toBe(cachedArchive);
      expect(mockPostFindMany).not.toHaveBeenCalled();
    });
  });
});
