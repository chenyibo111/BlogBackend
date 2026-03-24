import type { User, Post, Category, Media } from '@prisma/client';

// Re-export Prisma types
export type { User, Post, Category, Media };

// User types
export type UserRole = 'ADMIN' | 'EDITOR' | 'AUTHOR';

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  bio?: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

// Post types
export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED';

export interface PostWithAuthor extends Post {
  author: UserPublic;
  categories: Category[];
}

export interface PostCreateInput {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  coverImage?: string;
  status?: PostStatus;
  categoryIds?: string[];
}

export interface PostUpdateInput extends Partial<PostCreateInput> {
  id: string;
}

export interface PostFilter {
  status?: PostStatus;
  authorId?: string;
  categoryId?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  // Cursor pagination (#19)
  cursor?: string;  // 游标值（通常是最后一条记录的 ID 或 createdAt）
  cursorId?: number; // 用于游标分页的 ID
}

// Auth types
export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: UserPublic;
  tokens: AuthTokens;
}

// Upload types
export interface UploadResponse {
  file: Media;
  url: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Cursor pagination response (#19: 游标分页响应)
export interface CursorPaginatedResponse<T> {
  items: T[];
  nextCursor?: string | null;  // 下一页的游标
  hasMore: boolean;            // 是否还有更多数据
  limit: number;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

// Request extensions
export interface AuthRequest {
  user?: UserPublic;
}
