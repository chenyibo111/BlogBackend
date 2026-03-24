# The Silent Curator - Blog Backend

A minimal blog platform API built with Express, Prisma, and TypeScript.

## Features

- 🔐 JWT Authentication with HttpOnly Cookie support
- 📝 CRUD operations for blog posts
- 🖼️ Media upload with security validation
- 📚 Swagger API documentation
- 🚀 Cursor-based pagination
- 💾 In-memory caching for performance

## Tech Stack

- **Runtime**: Node.js 24+
- **Framework**: Express.js
- **ORM**: Prisma
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **Language**: TypeScript
- **Testing**: Vitest

## Quick Start

### Prerequisites

- Node.js 24+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL="file:./dev.db"

# JWT
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

## API Documentation

Access Swagger UI at: `http://localhost:3000/api-docs`

### Main Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/refresh` | Refresh tokens |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/posts` | List posts |
| GET | `/api/posts/:id` | Get post by ID or slug |
| POST | `/api/posts` | Create post |
| PATCH | `/api/posts/:id` | Update post |
| DELETE | `/api/posts/:id` | Delete post |
| POST | `/api/upload` | Upload file |

## Scripts

```bash
npm run dev      # Start development server with hot reload
npm run build    # Build for production
npm run start    # Start production server
npm run test     # Run tests
npm run lint     # Run ESLint
```

## Project Structure

```
src/
├── controllers/     # Request handlers
├── middleware/      # Express middleware (auth, error, etc.)
├── routes/          # API route definitions
├── services/        # Business logic
├── utils/           # Utility functions
├── types/           # TypeScript types
├── docs/            # Swagger/OpenAPI docs
└── index.ts         # App entry point
```

## Security Features

- ✅ JWT Secret validation on startup
- ✅ HttpOnly Cookie authentication
- ✅ Token blacklist for logout
- ✅ File upload validation (type, size, extension)
- ✅ CSP and security headers
- ✅ Rate limiting on auth endpoints
- ✅ XSS protection with DOMPurify (frontend)

## License

MIT