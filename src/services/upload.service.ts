import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import prisma from '../utils/prisma';
import type { UploadResponse } from '../types';
import { AppError } from '../middleware/errorHandler';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB

// Allowed file extensions (whitelist)
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

export function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export function validateFile(file: Express.Multer.File) {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    throw new AppError(
      `File size exceeds limit (${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      400,
      'FILE_TOO_LARGE'
    );
  }

  // Check file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.mimetype)) {
    throw new AppError(
      'Invalid file type. Allowed: jpeg, png, gif, webp',
      400,
      'INVALID_FILE_TYPE'
    );
  }

  // Security: Validate extension against whitelist
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new AppError(
      'Invalid file extension. Allowed: jpg, jpeg, png, gif, webp',
      400,
      'INVALID_FILE_EXTENSION'
    );
  }
}

/**
 * Save an uploaded file to the media library.
 * 
 * #65 TODO: Image optimization
 * Consider integrating sharp library for:
 * - Automatic image compression
 * - Resize large images to max dimensions
 * - Convert to WebP for better compression
 * - Generate thumbnails for previews
 * 
 * Example implementation:
 * ```ts
 * import sharp from 'sharp';
 * 
 * const optimized = await sharp(file.buffer)
 *   .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
 *   .webp({ quality: 85 })
 *   .toBuffer();
 * ```
 */
export async function saveFile(
  file: Express.Multer.File,
  uploadedById: string
): Promise<UploadResponse> {
  ensureUploadDir();

  // Security: Use only extension from original name, generate random filename
  const ext = path.extname(file.originalname).toLowerCase();
  
  // Security: Double-check extension is in whitelist
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new AppError(
      'Invalid file extension',
      400,
      'INVALID_FILE_EXTENSION'
    );
  }
  
  // Security: Use crypto for random filename instead of Math.random()
  const randomName = crypto.randomBytes(16).toString('hex');
  const filename = `${Date.now()}-${randomName}${ext}`;
  const filepath = path.resolve(UPLOAD_DIR, filename);

  // Security: Ensure the resolved path is still within UPLOAD_DIR
  const uploadDirResolved = path.resolve(UPLOAD_DIR);
  if (!filepath.startsWith(uploadDirResolved)) {
    throw new AppError(
      'Invalid file path',
      400,
      'INVALID_PATH'
    );
  }

  // Move file
  fs.writeFileSync(filepath, file.buffer);

  // Save to database
  const media = await prisma.media.create({
    data: {
      filename: filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: `/uploads/${filename}`,
      uploadedById,
    },
  });

  // Return full URL
  const fullUrl = `http://47.253.190.162${media.url}`;

  return {
    file: media,
    url: fullUrl,
  };
}

export async function getMediaLibrary(
  uploadedById: string,
  page = 1,
  limit = 20
) {
  const [items, total] = await Promise.all([
    prisma.media.findMany({
      where: { uploadedById },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.media.count({ where: { uploadedById } }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function deleteMedia(id: string, uploadedById: string): Promise<void> {
  const media = await prisma.media.findUnique({
    where: { id },
  });

  if (!media) {
    throw new AppError('Media not found', 404, 'NOT_FOUND');
  }

  if (media.uploadedById !== uploadedById) {
    throw new AppError('Unauthorized to delete this media', 403, 'FORBIDDEN');
  }

  // Data integrity: Delete from database FIRST
  // If this fails, file remains (can be cleaned up later)
  // If file deletion fails after DB delete, we have orphan file but data is consistent
  await prisma.media.delete({ where: { id } });

  // Then try to delete file (failure here is non-critical)
  try {
    const filepath = path.join(UPLOAD_DIR, media.filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  } catch (error) {
    // Log error but don't throw - database is already clean
    console.error(`[Media] Failed to delete file ${media.filename}:`, error);
    // Could add to cleanup queue for later retry
  }
}
