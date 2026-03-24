import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index';

// #68: Backend API tests

describe('Health Check', () => {
  it('should return healthy status', async () => {
    const response = await request(app).get('/health');
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('healthy');
  });
});

describe('Auth API', () => {
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPass123',
    name: 'Test User',
  };

  let accessToken: string;
  let refreshToken: string;

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.tokens.accessToken).toBeDefined();
      
      accessToken = response.body.data.tokens.accessToken;
      refreshToken = response.body.data.tokens.refreshToken;
    });

    it('should reject duplicate email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(response.status).toBe(409);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'incomplete@example.com' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.tokens.accessToken).toBeDefined();
    });

    it('should reject wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.email).toBe(testUser.email);
    });

    it('should reject request without token', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh tokens', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toBeDefined();
    });
  });
});

describe('Posts API', () => {
  describe('GET /api/posts', () => {
    it('should return paginated posts', async () => {
      const response = await request(app).get('/api/posts');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.items)).toBe(true);
    });

    it('should support cursor pagination', async () => {
      const response = await request(app)
        .get('/api/posts')
        .query({ cursor: '1', limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data.limit).toBe(10);
    });
  });
});