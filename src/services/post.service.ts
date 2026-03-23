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

  const [posts, total] = await Promise.all([
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

  return {
    items: posts as PostWithAuthor[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

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

  const data: any = {
    ...(input.title && { title: input.title }),
    ...(input.excerpt !== undefined && { excerpt: input.excerpt }),
    ...(input.content !== undefined && { content: input.content }),
    ...(input.coverImage !== undefined && { coverImage: input.coverImage }),
    ...(input.status && { status: input.status }),
    ...(slug && { slug }),
  };

  // Set publishedAt when publishing
  if (input.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
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
