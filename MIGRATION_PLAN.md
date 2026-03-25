# 数据库迁移 + 测试覆盖提升计划

## 📋 任务概览

| 任务 | 优先级 | 预计时间 | 风险 |
|------|--------|----------|------|
| PostgreSQL 迁移 | P0 | 2-3 小时 | 中 |
| 测试覆盖率提升 | P0 | 4-6 小时 | 低 |

---

## 一、数据库迁移：SQLite → PostgreSQL

### 1.1 迁移前准备

#### 步骤 1: 安装 PostgreSQL

**本地开发 (macOS):**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**本地开发 (Linux):**
```bash
sudo apt-get install postgresql postgresql-contrib
# or
sudo yum install postgresql-server postgresql-contrib
```

**Docker (推荐):**
```bash
docker run -d \
  --name blog-postgres \
  -e POSTGRES_USER=blog \
  -e POSTGRES_PASSWORD=blog123 \
  -e POSTGRES_DB=blog \
  -p 5432:5432 \
  -v blog_data:/var/lib/postgresql/data \
  postgres:15-alpine
```

#### 步骤 2: 创建数据库和用户

```bash
# 登录 PostgreSQL
psql -U postgres

# 创建数据库和用户
CREATE DATABASE blog;
CREATE USER blog_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE blog TO blog_user;
\q
```

#### 步骤 3: 安装 Prisma PostgreSQL 支持

```bash
cd BlogBackend
npm install --save-dev @prisma/adapter-pg pg
```

---

### 1.2 Prisma 配置修改

#### 修改 `schema.prisma`

```prisma
// 当前配置 (SQLite)
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// 修改为 (PostgreSQL)
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

#### 修改 `.env`

```env
# 开发环境 (本地 PostgreSQL)
DATABASE_URL="postgresql://blog_user:your_secure_password@localhost:5432/blog?schema=public"

# 生产环境 (根据实际情况修改)
# DATABASE_URL="postgresql://user:password@host:5432/blog?schema=public"
```

---

### 1.3 数据类型调整

SQLite 和 PostgreSQL 类型系统不同，需要调整：

| SQLite | PostgreSQL | 说明 |
|--------|------------|------|
| `DateTime` | `TIMESTAMP(3)` | Prisma 自动处理 |
| `String @id @default(uuid())` | `UUID @default(uuid())` | 原生 UUID 支持 |
| `Int @id @default(autoincrement())` | `Serial` 或 `Identity` | 自增主键 |

**需要修改的模型：**

```prisma
// User 模型 - UUID 保持不变
model User {
  id        String   @id @default(uuid()) @db.Uuid
  // ... 其他字段
}

// Post 模型 - 自增 ID 调整
model Post {
  id          Int      @id @default(autoincrement()) // PostgreSQL 自动使用 Serial
  // ... 其他字段
  
  // 注意：PostgreSQL 的 cascade 删除语法不同
  author      User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
```

---

### 1.4 数据迁移方案

#### 方案 A: Prisma Migrate (推荐)

```bash
# 1. 备份 SQLite 数据
cp prisma/dev.db prisma/dev.db.backup

# 2. 生成新的迁移
npx prisma migrate dev --name init_postgresql

# 3. 检查生成的 SQL
cat prisma/migrations/*/migration.sql

# 4. 应用到 PostgreSQL
npx prisma migrate deploy
```

#### 方案 B: 手动数据迁移

如果数据量不大，可以手动导出导入：

```bash
# 导出 SQLite 数据
sqlite3 prisma/dev.db ".mode csv" ".output users.csv" "SELECT * FROM users;"
sqlite3 prisma/dev.db ".mode csv" ".output posts.csv" "SELECT * FROM posts;"

# 导入 PostgreSQL (使用 COPY 命令)
psql -U blog_user -d blog
\copy users FROM 'users.csv' CSV;
\copy posts FROM 'posts.csv' CSV;
```

#### 方案 C: 使用迁移工具

```bash
# 安装 pgloader
brew install pgloader  # macOS
# or
sudo apt-get install pgloader  # Linux

# 迁移 SQLite 到 PostgreSQL
pgloader sqlite://prisma/dev.db postgresql://blog_user:password@localhost/blog
```

---

### 1.5 代码适配

#### 检查 SQLite 特有语法

```typescript
// ❌ SQLite 特有
WHERE datetime(created_at) = datetime('now')

// ✅ PostgreSQL 兼容
WHERE DATE(created_at) = CURRENT_DATE
```

#### 连接池配置 (生产环境)

```typescript
// src/index.ts
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const connectionString = process.env.DATABASE_URL!

// 生产环境使用连接池
const pool = new Pool({
  connectionString,
  max: 20, // 最大连接数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })
```

---

### 1.6 测试验证

```bash
# 1. 生成 Prisma Client
npx prisma generate

# 2. 运行测试
npm run test:run

# 3. 手动测试 API
curl http://localhost:3000/api/posts
```

---

### 1.7 回滚方案

如果迁移失败：

```bash
# 1. 恢复 .env 配置
DATABASE_URL="file:./dev.db"

# 2. 恢复备份
cp prisma/dev.db.backup prisma/dev.db

# 3. 重新生成 SQLite client
npx prisma generate
```

---

## 二、测试覆盖率提升

### 2.1 当前状态分析

**现有测试文件：**
- `src/tests/api.test.ts` - API 集成测试

**目标覆盖率：**
- 整体：60% → 80%
- 关键模块 (controllers, services)：80% → 95%

---

### 2.2 测试文件结构规划

```
src/
├── controllers/
│   ├── auth.controller.ts
│   ├── post.controller.ts
│   └── upload.controller.ts
├── services/
│   ├── auth.service.ts
│   ├── post.service.ts
│   └── upload.service.ts
├── middleware/
│   ├── auth.middleware.ts
│   ├── error.middleware.ts
│   └── validation.middleware.ts
└── tests/
    ├── api.test.ts (现有)
    ├── unit/
    │   ├── controllers/
    │   │   ├── auth.controller.test.ts
    │   │   ├── post.controller.test.ts
    │   │   └── upload.controller.test.ts
    │   ├── services/
    │   │   ├── auth.service.test.ts
    │   │   ├── post.service.test.ts
    │   │   └── upload.service.test.ts
    │   └── middleware/
    │       ├── auth.middleware.test.ts
    │       └── error.middleware.test.ts
    └── integration/
        ├── auth.integration.test.ts
        ├── post.integration.test.ts
        └── upload.integration.test.ts
```

---

### 2.3 单元测试示例

#### `tests/unit/services/auth.service.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../../src/services/auth.service';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
} as unknown as PrismaClient;

// Mock JWT
vi.mock('jsonwebtoken', () => ({
  sign: vi.fn(() => 'mocked-token'),
  verify: vi.fn(() => ({ id: 'user-id' })),
}));

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService(mockPrisma);
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should create a new user successfully', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed-password',
      };

      vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password');
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await authService.register({
        email: 'test@example.com',
        name: 'Test User',
        password: 'SecurePass123!',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.user.password).toBeUndefined();
      expect(bcrypt.hash).toHaveBeenCalled();
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
          name: 'Test User',
        }),
      });
    });

    it('should throw error if email already exists', async () => {
      mockPrisma.user.create.mockRejectedValue(new Error('Unique constraint failed'));

      await expect(
        authService.register({
          email: 'existing@example.com',
          name: 'Test',
          password: 'password',
        })
      ).rejects.toThrow('Email already exists');
    });

    it('should hash password before storing', async () => {
      const hashSpy = vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed');
      mockPrisma.user.create.mockResolvedValue({ id: '1', password: 'hashed' });

      await authService.register({
        email: 'test@example.com',
        name: 'Test',
        password: 'plain-password',
      });

      expect(hashSpy).toHaveBeenCalledWith('plain-password', 10);
    });
  });

  describe('login', () => {
    it('should return tokens on successful login', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        password: await bcrypt.hash('correct-password', 10),
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      const result = await authService.login('test@example.com', 'correct-password');

      expect(result.accessToken).toBe('mocked-token');
      expect(result.refreshToken).toBe('mocked-token');
    });

    it('should throw error for invalid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login('wrong@example.com', 'password')
      ).rejects.toThrow('Invalid credentials');
    });
  });
});
```

---

#### `tests/unit/middleware/auth.middleware.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authMiddleware } from '../../../src/middleware/auth.middleware';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Mock JWT
vi.mock('jsonwebtoken', () => ({
  verify: vi.fn(),
}));

describe('authMiddleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      cookies: {},
      headers: {},
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    nextFunction = vi.fn();
  });

  it('should call next when valid token in cookie', async () => {
    const mockUser = { id: 'user-id', email: 'test@example.com' };
    vi.mocked(jwt.verify).mockReturnValue(mockUser);
    mockRequest.cookies = { accessToken: 'valid-token' };

    await authMiddleware(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toHaveBeenCalled();
    expect((mockRequest as any).user).toEqual(mockUser);
  });

  it('should call next when valid token in Authorization header', async () => {
    const mockUser = { id: 'user-id' };
    vi.mocked(jwt.verify).mockReturnValue(mockUser);
    mockRequest.headers = { authorization: 'Bearer valid-token' };

    await authMiddleware(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toHaveBeenCalled();
  });

  it('should return 401 when no token provided', async () => {
    await authMiddleware(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unauthorized' })
    );
  });

  it('should return 401 when token is invalid', async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error('Invalid token');
    });
    mockRequest.cookies = { accessToken: 'invalid-token' };

    await authMiddleware(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(401);
  });
});
```

---

### 2.4 集成测试示例

#### `tests/integration/post.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

describe('Post API Integration', () => {
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create test user
    const hashedPassword = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'test@integration.com',
        name: 'Test User',
        password: hashedPassword,
        role: 'ADMIN',
      },
    });
    testUserId = user.id;
  });

  beforeEach(async () => {
    // Login to get token
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@integration.com', password: 'TestPass123!' });
    authToken = response.body.data.accessToken;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.post.deleteMany();
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  describe('POST /api/posts', () => {
    it('should create a new post', async () => {
      const newPost = {
        title: 'Test Post',
        content: 'Test content',
        excerpt: 'Test excerpt',
        status: 'PUBLISHED',
      };

      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newPost);

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        title: 'Test Post',
        content: 'Test content',
        status: 'PUBLISHED',
      });
      expect(response.body.data.slug).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/posts')
        .send({ title: 'Test' });

      expect(response.status).toBe(401);
    });

    it('should return 400 with invalid data', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: '' }); // Empty title

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/posts', () => {
    it('should return paginated posts', async () => {
      const response = await request(app).get('/api/posts');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('posts');
      expect(response.body.data).toHaveProperty('pagination');
      expect(response.body.data.pagination).toHaveProperty('page');
      expect(response.body.data.pagination).toHaveProperty('pageSize');
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/posts?status=PUBLISHED');

      expect(response.status).toBe(200);
      response.body.data.posts.forEach((post: any) => {
        expect(post.status).toBe('PUBLISHED');
      });
    });

    it('should search by keyword', async () => {
      const response = await request(app)
        .get('/api/posts?search=Test');

      expect(response.status).toBe(200);
    });
  });

  describe('DELETE /api/posts/:id', () => {
    it('should delete a post', async () => {
      // Create a post first
      const createResponse = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'To Delete',
          content: 'Content',
          status: 'DRAFT',
        });

      const postId = createResponse.body.data.id;

      // Delete it
      const deleteResponse = await request(app)
        .delete(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(204);

      // Verify deletion
      const getResponse = await request(app)
        .get(`/api/posts/${postId}`);

      expect(getResponse.status).toBe(404);
    });
  });
});
```

---

### 2.5 测试数据库配置

创建 `vitest.config.ts` 测试专用配置：

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        'prisma/',
        'docs/',
        'tests/',
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
})
```

创建 `tests/setup.ts`:

```typescript
import { vi } from 'vitest';

// Mock console in tests to reduce noise
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.DATABASE_URL = 'file:./test.db';
```

---

### 2.6 执行计划

#### Phase 1: 数据库迁移 (2-3 小时)

```bash
# 1. 安装 PostgreSQL (Docker)
docker run -d --name blog-postgres -e POSTGRES_USER=blog -e POSTGRES_PASSWORD=blog123 -e POSTGRES_DB=blog -p 5432:5432 postgres:15-alpine

# 2. 修改 schema.prisma (SQLite → PostgreSQL)
# 3. 修改 .env (DATABASE_URL)
# 4. 安装依赖
npm install --save-dev @prisma/adapter-pg pg

# 5. 生成迁移
npx prisma migrate dev --name init_postgresql

# 6. 应用迁移
npx prisma migrate deploy

# 7. 生成 Client
npx prisma generate

# 8. 运行测试验证
npm run test:run
```

#### Phase 2: 测试覆盖提升 (4-6 小时)

```bash
# 1. 创建测试目录结构
mkdir -p src/tests/unit/{controllers,services,middleware}
mkdir -p src/tests/integration

# 2. 创建测试文件 (按优先级)
# - services/auth.service.test.ts
# - services/post.service.test.ts
# - middleware/auth.middleware.test.ts
# - controllers/auth.controller.test.ts
# - controllers/post.controller.test.ts

# 3. 创建集成测试
# - integration/auth.integration.test.ts
# - integration/post.integration.test.ts

# 4. 运行测试并检查覆盖率
npm run test:coverage

# 5. 查看 HTML 报告
open coverage/index.html
```

---

### 2.7 覆盖率目标

| 模块 | 当前 | 目标 | 优先级 |
|------|------|------|--------|
| services/auth | ~20% | 95% | P0 |
| services/post | ~20% | 90% | P0 |
| middleware/auth | ~30% | 95% | P0 |
| controllers/auth | ~25% | 85% | P1 |
| controllers/post | ~25% | 85% | P1 |
| utils | ~10% | 70% | P2 |

---

## 三、CI/CD 集成

### GitHub Actions 配置

创建 `.github/workflows/test.yml`:

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: blog
          POSTGRES_PASSWORD: test123
          POSTGRES_DB: blog_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'
          cache-dependency-path: BlogBackend/package-lock.json
      
      - name: Install dependencies
        working-directory: BlogBackend
        run: npm ci
      
      - name: Generate Prisma Client
        working-directory: BlogBackend
        run: npx prisma generate
        env:
          DATABASE_URL: postgresql://blog:test123@localhost:5432/blog_test
      
      - name: Run migrations
        working-directory: BlogBackend
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://blog:test123@localhost:5432/blog_test
      
      - name: Run tests
        working-directory: BlogBackend
        run: npm run test:coverage
        env:
          DATABASE_URL: postgresql://blog:test123@localhost:5432/blog_test
          JWT_SECRET: test-secret
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: BlogBackend/coverage/lcov.info
          flags: backend
```

---

## 四、风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 数据丢失 | 高 | 迁移前完整备份 |
| 类型不兼容 | 中 | 详细审查 Prisma schema |
| 测试失败 | 低 | 逐个模块修复 |
| 性能下降 | 中 | PostgreSQL 索引优化 |

---

## 五、验收标准

### 数据库迁移
- [ ] PostgreSQL 正常运行
- [ ] 所有表结构正确创建
- [ ] 数据完整迁移（如有）
- [ ] API 测试全部通过
- [ ] 回滚方案验证通过

### 测试覆盖
- [ ] 整体覆盖率 ≥ 80%
- [ ] 核心服务覆盖率 ≥ 90%
- [ ] 所有 API 端点有集成测试
- [ ] CI/CD 自动运行测试
- [ ] 测试文档完善

---

*创建时间：2026-03-24*
*负责人：刀盾 🐕*
