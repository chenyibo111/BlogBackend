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
