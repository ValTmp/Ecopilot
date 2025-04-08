const security = require('../src/middleware/security');
const redis = require('../src/config/redis');
const jwt = require('jsonwebtoken');

// Mock Redis
jest.mock('../src/config/redis', () => ({
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  flushall: jest.fn()
}));

// Mock jwt
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

describe('Security Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      headers: {},
      ip: '127.0.0.1',
      path: '/api/test'
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('rateLimiter', () => {
    it('should allow request within rate limit', async () => {
      redis.get.mockResolvedValue('5');

      await security.rateLimiter(mockReq, mockRes, mockNext);

      expect(redis.get).toHaveBeenCalledWith('rate:127.0.0.1:/api/test');
      expect(redis.setex).toHaveBeenCalledWith(
        'rate:127.0.0.1:/api/test',
        60,
        '6'
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should block request exceeding rate limit', async () => {
      redis.get.mockResolvedValue('10');

      await security.rateLimiter(mockReq, mockRes, mockNext);

      expect(redis.get).toHaveBeenCalledWith('rate:127.0.0.1:/api/test');
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Too many requests, please try again later.'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      redis.get.mockRejectedValue(new Error('Redis error'));

      await security.rateLimiter(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('authenticate', () => {
    it('should authenticate valid token', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com'
      };

      mockReq.headers.authorization = 'Bearer valid-token';
      jwt.verify.mockReturnValue({ userId: 'user123' });

      await security.authenticate(mockReq, mockRes, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.JWT_SECRET);
      expect(mockReq.user).toEqual({ userId: 'user123' });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject missing token', async () => {
      await security.authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Authentication token is required'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token format', async () => {
      mockReq.headers.authorization = 'InvalidFormat token';

      await security.authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid token format'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      mockReq.headers.authorization = 'Bearer invalid-token';
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await security.authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid token'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateApiKey', () => {
    it('should validate correct API key', async () => {
      mockReq.headers['x-api-key'] = process.env.API_KEY;

      await security.validateApiKey(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject missing API key', async () => {
      await security.validateApiKey(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'API key is required'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid API key', async () => {
      mockReq.headers['x-api-key'] = 'invalid-key';

      await security.validateApiKey(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid API key'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeInput', () => {
    it('should sanitize request body', () => {
      mockReq.body = {
        name: '<script>alert("xss")</script>Test User',
        email: ' test@example.com ',
        password: ' password123 '
      };

      security.sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockReq.body).toEqual({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle empty request body', () => {
      mockReq.body = {};

      security.sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockReq.body).toEqual({});
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle non-string values', () => {
      mockReq.body = {
        name: 123,
        email: null,
        password: undefined
      };

      security.sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockReq.body).toEqual({
        name: 123,
        email: null,
        password: undefined
      });
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateOrigin', () => {
    it('should allow request from whitelisted origin', () => {
      mockReq.headers.origin = process.env.ALLOWED_ORIGINS.split(',')[0];

      security.validateOrigin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request from non-whitelisted origin', () => {
      mockReq.headers.origin = 'http://malicious-site.com';

      security.validateOrigin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Origin not allowed'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow request without origin header', () => {
      security.validateOrigin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
}); 