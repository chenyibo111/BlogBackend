import path from 'path';
import fs from 'fs';
import prisma from '../utils/prisma';
import type { UploadResponse } from '../types';
import { AppError } from '../middleware/errorHandler';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB

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
}

export async function saveFile(
  file: Express.Multer.File,
  uploadedById: string
): Promise<UploadResponse> {
  ensureUploadDir();

  // Generate unique filename
  const ext = path.extname(file.originalname);
  const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

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
  const fullUrl = `${process.env.API_URL || 'http://localhost:3000'}${media.url}`;

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

  // Delete file
  const filepath = path.join(UPLOAD_DIR, media.filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }

  // Delete from database
  await prisma.media.delete({ where: { id } });
}
