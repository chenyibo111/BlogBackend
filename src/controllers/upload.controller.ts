import type { Request, Response, NextFunction } from 'express';
import * as uploadService from '../services/upload.service';
import type { AuthRequest } from '../types';

export async function uploadFile(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const uploadedById = req.user!.id;

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No file uploaded',
        },
      });
      return;
    }

    // Validate file
    uploadService.validateFile(req.file);

    // Save file
    const result = await uploadService.saveFile(req.file, uploadedById);

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMedia(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const uploadedById = req.user!.id;
    const page = parseInt(String(req.query.page)) || 1;
    const limit = parseInt(String(req.query.limit)) || 20;

    const media = await uploadService.getMediaLibrary(uploadedById, page, limit);

    res.json({
      success: true,
      data: media,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteMedia(req: Request & AuthRequest, res: Response, next: NextFunction) {
  try {
    const uploadedById = req.user!.id;
    const id = String(req.params.id);

    await uploadService.deleteMedia(id, uploadedById);

    res.json({
      success: true,
      data: { message: 'Media deleted successfully' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
