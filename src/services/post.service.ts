import prisma from '../utils/prisma';
import { generateSlug } from '../utils/slug';
import { cache, CacheKeys, CacheTTL } from '../utils/cache';
import type { PostCreateInput, PostUpdateInput, PostFilter, PostWithAuthor, UserPublic } from '../types';
import { AppError } from '../middleware/errorHandler';

// Type for archive response
interface ArchivePost {
  id: number;
  slug: string;
  title: string;
  publishedAt: Date | null;
  createdAt: Date;
  status: string;
}

interface ArchiveYear {
  year: number;
  posts: ArchivePost[];
  count: number;
}

// Helper to invalidate post-related caches
function invalidatePostCache(postId?: number, slug?: string) {
  cache.deletePattern('^posts:list');
  cache.delete(CacheKeys.archive());
  if (postId) {
    cache.delete(CacheKeys.post(postId));
  }
  if (slug) {
    cache.delete(CacheKeys.postBySlug(slug));
  }
}

/**
 * Get paginated list of posts with filtering and sorting.
 * 
 * - Supports cursor-based pagination for large datasets
 * - Permission-aware: unauthenticated users only see published posts
 * - Authors see all their own posts, only published from others
 * - Admins/Editors see all posts
 * 
 * @param filter - Query filters (status, authorId, categoryId, search, pagination)
 * @param currentUser - Current authenticated user (for permission checks)
 * @returns Paginated post list with metadata
 */
export async function getPosts(filter: PostFilter, currentUser?: UserPublic | null) {
  const {
    status,
    authorId,
    categoryId,
    search,
    page = 1,
    limit = 20,
    sortBy = 'publishedAt',
    order = 'desc',
    cursor,
    cursorId,
  } = filter;

  const where: any = {};

  // 权限控制
  if (!currentUser) {
    // 未登录：只能看已发布
    where.status = 'PUBLISHED';
  } else if (currentUser.role === 'AUTHOR') {
    // AUTHOR 角色：如果查询自己的文章，可以看到所有状态；如果查询别人的，只能看已发布
    if (authorId && authorId !== currentUser.id) {
      // 查询别人的文章：只能看已发布
      where.status = 'PUBLISHED';
    }
    // 查询自己的文章（authorId 为空或等于 currentUser.id）：不限制状态
  }
  // ADMIN/EDITOR 可以看到所有状态的文章
  
  // 如果 filter 中明确指定了 status，以 filter 为准（用于管理员筛选）
  if (status && currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'EDITOR')) {
    where.status = status;
  }
  
  if (authorId) where.authorId = authorId;
  
  if (categoryId) {
    where.categories = { some: { id: categoryId } };
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { excerpt: { contains: search, mode: 'insensitive' } },
      { content: { contains: search, mode: 'insensitive' } },
    ];
  }

  // #19: 游标分页优化
  // 如果提供了 cursor，使用游标分页；否则使用传统的 offset 分页
  const useCursorPagination = cursor || cursorId;
  
  let posts: any[];
  let total: number;
  let hasMore = false;
  let nextCursor: string | null = null;

  if (useCursorPagination) {
    // 游标分页：基于 cursor 过滤
    const cursorValue = cursorId ? cursorId : cursor ? parseInt(cursor) : null;
    
    if (cursorValue && !isNaN(cursorValue)) {
      // 使用 cursor + sortBy 组合条件
      // 这里简化为基于 ID 的游标分页
      where.id = order === 'desc' 
        ? { lt: cursorValue }  // 降序：取比 cursor 小的
        : { gt: cursorValue }; // 升序：取比 cursor 大的
    }

    // 取 limit + 1 条来判断 hasMore
    const items = await prisma.post.findMany({
      where,
      include: {
        author: {
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
        },
        categories: true,
      },
      take: limit + 1,
      orderBy: { [sortBy]: order },
    });

    hasMore = items.length > limit;
    posts = hasMore ? items.slice(0, limit) : items;
    
    // 设置下一页的 cursor
    if (hasMore && posts.length > 0) {
      nextCursor = String(posts[posts.length - 1].id);
    }

    // 游标分页不需要 total（可以单独查询）
    total = await prisma.post.count({ where: { ...where, id: undefined } });
  } else {
    // 传统 offset 分页（保留兼容性）
    [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          author: {
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
          },
          categories: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: order },
      }),
      prisma.post.count({ where }),
    ]);
  }

  return {
    items: posts as PostWithAuthor[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    // 游标分页额外字段
    nextCursor,
    hasMore,
  };
}

/**
 * Get a single post by ID.
 * 
 * - Permission-aware: non-authors can only see published posts
 * - Cached for published posts to improve performance
 * 
 * @param id - Post ID
 * @param currentUser - Current user for permission check
 * @returns Post with author and categories
 * @throws AppError(404) if not found or no permission
 */
export async function getPostById(id: number, currentUser?: UserPublic | null): Promise<PostWithAuthor> {
  // Check cache first (only for public/published posts)
  if (!currentUser || currentUser.role === 'AUTHOR') {
    const cached = cache.get<PostWithAuthor>(CacheKeys.post(id));
    if (cached && cached.status === 'PUBLISHED') {
      return cached;
    }
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: {
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
      },
      categories: true,
    },
  });

  if (!post) {
    throw new AppError('Post not found', 404, 'NOT_FOUND');
  }

  // 权限控制：未登录或普通用户只能看已发布文章
  if (!currentUser || currentUser.role === 'AUTHOR') {
    if (post.status !== 'PUBLISHED') {
      // 如果不是作者本人，返回 404（不暴露文章存在）
      if (!currentUser || post.authorId !== currentUser.id) {
        throw new AppError('Post not found', 404, 'NOT_FOUND');
      }
    }
  }
  // ADMIN/EDITOR 可以看到所有文章

  const result = post as PostWithAuthor;
  
  // Cache published posts
  if (post.status === 'PUBLISHED') {
    cache.set(CacheKeys.post(id), result, CacheTTL.MEDIUM);
  }

  return result;
}

/**
 * Get a single post by slug (URL-friendly identifier).
 * 
 * - Permission-aware: non-authors can only see published posts
 * - Cached for published posts to improve performance
 * 
 * @param slug - Post slug
 * @param currentUser - Current user for permission check
 * @returns Post with author and categories
 * @throws AppError(404) if not found or no permission
 */
export async function getPostBySlug(slug: string, currentUser?: UserPublic | null): Promise<PostWithAuthor> {
  // Check cache first (only for public/published posts)
  if (!currentUser || currentUser.role === 'AUTHOR') {
    const cached = cache.get<PostWithAuthor>(CacheKeys.postBySlug(slug));
    if (cached && cached.status === 'PUBLISHED') {
      return cached;
    }
  }

  const post = await prisma.post.findUnique({
    where: { slug },
    include: {
      author: {
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
      },
      categories: true,
    },
  });

  if (!post) {
    throw new AppError('Post not found', 404, 'NOT_FOUND');
  }

  // 权限控制：未登录或普通用户只能看已发布文章
  if (!currentUser || currentUser.role === 'AUTHOR') {
    if (post.status !== 'PUBLISHED') {
      // 如果不是作者本人，返回 404（不暴露文章存在）
      if (!currentUser || post.authorId !== currentUser.id) {
        throw new AppError('Post not found', 404, 'NOT_FOUND');
      }
    }
  }
  // ADMIN/EDITOR 可以看到所有文章

  const result = post as PostWithAuthor;
  
  // Cache published posts
  if (post.status === 'PUBLISHED') {
    cache.set(CacheKeys.postBySlug(slug), result, CacheTTL.MEDIUM);
    // Also cache by ID
    cache.set(CacheKeys.post(post.id), result, CacheTTL.MEDIUM);
  }

  return result;
}

/**
 * Create a new blog post.
 * 
 * - Auto-generates slug from title if not provided
 * - Ensures slug uniqueness by appending timestamp if needed
 * - Sets publishedAt when status is PUBLISHED
 * - Invalidates relevant caches
 * 
 * @param input - Post data (title, content, excerpt, etc.)
 * @param authorId - ID of the post author
 * @returns Created post with author and categories
 */
export async function createPost(
  input: PostCreateInput,
  authorId: string
): Promise<PostWithAuthor> {
  // Generate slug if not provided
  let slug = input.slug || generateSlug(input.title);
  
  // Ensure slug is unique
  const existing = await prisma.post.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  // Normalize status to uppercase
  const normalizedStatus = input.status?.toUpperCase() as 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED' | undefined;

  const post = await prisma.post.create({
    data: {
      slug,
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      coverImage: input.coverImage,
      status: normalizedStatus || 'DRAFT',
      authorId,
      publishedAt: normalizedStatus === 'PUBLISHED' ? new Date() : new Date(),
      categories: input.categoryIds ? {
        connect: input.categoryIds.map(id => ({ id })),
      } : undefined,
    },
    include: {
      author: {
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
      },
      categories: true,
    },
  });

  const result = post as PostWithAuthor;
  
  // Invalidate cache for post lists and archive
  invalidatePostCache();
  
  return result;
}

/**
 * Update an existing blog post.
 * 
 * - Permission check: only author, ADMIN, or EDITOR can update
 * - Auto-regenerates slug if title changes and no slug provided
 * - Sets publishedAt when status changes to PUBLISHED
 * - Invalidates relevant caches
 * 
 * @param id - Post ID to update
 * @param input - Fields to update
 * @param currentUser - Current user for permission check
 * @returns Updated post with author and categories
 * @throws AppError(404) if post not found
 * @throws AppError(403) if user lacks permission
 */
export async function updatePost(
  id: number,
  input: PostUpdateInput,
  currentUser: UserPublic
): Promise<PostWithAuthor> {
  // First check if post exists
  const existing = await prisma.post.findUnique({
    where: { id },
    select: { status: true, authorId: true },
  });

  if (!existing) {
    throw new AppError('Post not found', 404, 'NOT_FOUND');
  }

  // 权限检查：只能编辑自己的文章（ADMIN/EDITOR 除外）
  if (existing.authorId !== currentUser.id && 
      currentUser.role !== 'ADMIN' && 
      currentUser.role !== 'EDITOR') {
    throw new AppError('You can only edit your own posts', 403, 'FORBIDDEN');
  }

  // Generate slug if title changed
  let slug = input.slug;
  if (input.title && !input.slug) {
    slug = generateSlug(input.title);
    const slugExists = await prisma.post.findFirst({
      where: { slug, NOT: { id } },
    });
    if (slugExists) {
      slug = `${slug}-${Date.now()}`;
    }
  }

  // Normalize status to uppercase
  const normalizedStatus = input.status?.toUpperCase() as 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED' | undefined;

  const data: any = {
    ...(input.title && { title: input.title }),
    ...(input.excerpt !== undefined && { excerpt: input.excerpt }),
    ...(input.content !== undefined && { content: input.content }),
    ...(input.coverImage !== undefined && { coverImage: input.coverImage }),
    ...(normalizedStatus && { status: normalizedStatus }),
    ...(slug && { slug }),
  };

  // Set publishedAt when publishing
  if (normalizedStatus === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
    data.publishedAt = new Date();
  }

  // Update categories if provided
  if (input.categoryIds !== undefined) {
    data.categories = {
      set: [],
      connect: input.categoryIds.map((id: string) => ({ id })),
    };
  }

  const post = await prisma.post.update({
    where: { id },
    data,
    include: {
      author: {
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
      },
      categories: true,
    },
  });

  const result = post as PostWithAuthor;
  
  // Invalidate cache
  invalidatePostCache(id, slug);
  
  return result;
}

/**
 * Delete a blog post.
 * 
 * - Permission check: only author, ADMIN, or EDITOR can delete
 * - Invalidates relevant caches after deletion
 * 
 * @param id - Post ID to delete
 * @param currentUser - Current user for permission check
 * @throws AppError(403) if user lacks permission
 */
export async function deletePost(id: number, currentUser?: UserPublic): Promise<void> {
  // 权限检查
  if (currentUser) {
    const existing = await prisma.post.findUnique({
      where: { id },
      select: { authorId: true },
    });
    
    if (existing && 
        existing.authorId !== currentUser.id && 
        currentUser.role !== 'ADMIN' && 
        currentUser.role !== 'EDITOR') {
      throw new AppError('You can only delete your own posts', 403, 'FORBIDDEN');
    }
  }
  
  await prisma.post.delete({
    where: { id },
  });
  
  // Invalidate cache
  invalidatePostCache(id);
}

/**
 * Publish a blog post (change status to PUBLISHED).
 * Sets publishedAt timestamp to now.
 * 
 * @param id - Post ID to publish
 * @returns Updated post
 */
export async function publishPost(id: number): Promise<PostWithAuthor> {
  const post = await prisma.post.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
    include: {
      author: {
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
      },
      categories: true,
    },
  });

  const result = post as PostWithAuthor;
  
  // Invalidate cache
  invalidatePostCache(id);
  
  return result;
}

/**
 * Unpublish a blog post (change status to DRAFT).
 * Clears publishedAt timestamp.
 * 
 * @param id - Post ID to unpublish
 * @returns Updated post
 */
export async function unpublishPost(id: number): Promise<PostWithAuthor> {
  const post = await prisma.post.update({
    where: { id },
    data: {
      status: 'DRAFT',
      publishedAt: null,
    },
    include: {
      author: {
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
      },
      categories: true,
    },
  });

  const result = post as PostWithAuthor;
  
  // Invalidate cache
  invalidatePostCache(id);
  
  return result;
}

/**
 * Get archive of posts grouped by year.
 * 
 * - Permission-aware: non-authenticated users only see published posts
 * - Cached for performance on public requests
 * 
 * @param currentUser - Current user for permission check
 * @returns Array of years with their posts
 */
export async function getArchive(currentUser?: UserPublic | null) {
  // Only cache public archive (no user or non-admin user)
  const shouldCache = !currentUser || currentUser.role === 'AUTHOR';
  
  if (shouldCache) {
    const cached = cache.get<(ArchiveYear)>(CacheKeys.archive());
    if (cached) {
      return cached;
    }
  }

  const where: any = {};
  
  // 权限控制：未登录或普通用户只看已发布文章
  if (!currentUser || currentUser.role === 'AUTHOR') {
    where.status = 'PUBLISHED';
  }
  // ADMIN/EDITOR 可以看到所有状态的文章

  const posts = await prisma.post.findMany({
    where,
    select: {
      id: true,
      slug: true,
      title: true,
      publishedAt: true,
      createdAt: true,
      status: true,
    },
    orderBy: { publishedAt: 'desc' },
  });

  // Group by year (use createdAt if publishedAt is null)
  const byYear = posts.reduce((acc, post) => {
    const date = post.publishedAt || post.createdAt;
    const year = new Date(date).getFullYear();
    if (!acc[year]) acc[year] = [];
    acc[year].push(post);
    return acc;
  }, {} as Record<number, typeof posts>);

  const result = Object.entries(byYear).map(([year, posts]) => ({
    year: Number(year),
    posts,
    count: posts.length,
  }));

  // Cache public archive
  if (shouldCache) {
    cache.set(CacheKeys.archive(), result, CacheTTL.LONG);
  }

  return result;
}
