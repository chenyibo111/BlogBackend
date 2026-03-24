import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.routes';
import postRoutes from './routes/post.routes';
import uploadRoutes from './routes/upload.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { swaggerSpec } from './swagger';

// Load environment variables
dotenv.config();

const app = express();

// #38: 环境配置，避免硬编码
const isDevelopment = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 3000;

// ALLOWED_ORIGINS: 开发环境允许 localhost，生产环境必须显式配置
const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : (isDevelopment ? DEFAULT_DEV_ORIGINS : []);

// 生产环境检查
if (!isDevelopment && ALLOWED_ORIGINS.length === 0) {
  console.warn('⚠️  WARNING: ALLOWED_ORIGINS not set in production mode');
}

// Security headers middleware
app.use((_req, res, next) => {
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https: blob:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  );
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
});

// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
  // Skip rate limiting for API routes (only apply to auth)
  skip: (req) => !req.path.startsWith('/api/auth'),
});

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(limiter);

// #12: Cookie parser for HttpOnly cookies
app.use(cookieParser());

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Upload routes - MUST be before JSON middleware to handle multipart/form-data
app.use('/api/upload', uploadRoutes);

// Increase payload size limit for file uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Blog API Documentation',
}));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

// Error handling
app.use(errorHandler);
app.use(notFoundHandler);

// Start server
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║                                                  ║
║   🚀 Blog API Server is running!                ║
║                                                  ║
║   Local:   http://localhost:${PORT}                ║
║   Health:  http://localhost:${PORT}/health         ║
║   API Docs: http://localhost:${PORT}/api-docs      ║
║                                                  ║
║   API Endpoints:                                 ║
║   - POST   /api/auth/register                   ║
║   - POST   /api/auth/login                      ║
║   - POST   /api/auth/refresh                    ║
║   - GET    /api/auth/me                         ║
║   - GET    /api/posts                           ║
║   - POST   /api/posts                           ║
║   - GET    /api/posts/:slug                     ║
║   - PATCH  /api/posts/:id                       ║
║   - DELETE /api/posts/:id                       ║
║   - POST   /api/upload                          ║
║                                                  ║
╚══════════════════════════════════════════════════╝
  `);
});

export default app;
