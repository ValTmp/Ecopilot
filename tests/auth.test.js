// @KI-GEN-START [2025-04-06]
const jwt = require('jsonwebtoken');
const { AuthenticationError } = require('../src/utils/errors');
const auth = require('../src/middleware/auth');
const cache = require('../src/config/redis');
const { db, TABLES, FIELDS } = require('../src/config/database');

// Mock dependencies
jest.mock('../src/config/redis');
jest.mock('../src/services/logger');
jest.mock('../src/config/database', () => ({
  db: {
    select: jest.fn()
  },
  TABLES: {
    USERS: 'Users'
  },
  FIELDS: {
    USERS: {
      ID: 'User_ID',
      EMAIL: 'Email',
      NAME: 'Name',
      POINTS: 'Points',
      PREFERENCES: 'Preferences'
    }
  }
}));

// Mock user data
const mockUser = {
  id: 'user123',
  email: 'test@example.com',
  role: 'user'
};

// Mock admin user
const mockAdmin = {
  id: 'admin123',
  email: 'admin@example.com',
  role: 'admin'
};

// Mock Airtable user data
const mockAirtableUser = {
  [FIELDS.USERS.ID]: 'user123',
  [FIELDS.USERS.EMAIL]: 'test@example.com',
  [FIELDS.USERS.NAME]: 'Test User',
  [FIELDS.USERS.POINTS]: 100,
  [FIELDS.USERS.PREFERENCES]: { theme: 'dark' },
  role: 'user'
};

// Mock request and response objects
const createMockReqRes = (headers = {}, cookies = {}) => {
  const req = {
    headers,
    cookies,
    user: null
  };
  
  const res = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
    cookie: jest.fn(),
    clearCookie: jest.fn()
  };
  
  const next = jest.fn();
  
  return { req, res, next };
};

describe('Authentication Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset cache mock
    cache.get.mockReset();
    cache.set.mockReset();
    cache.del.mockReset();
    cache.exists.mockReset();
    
    // Reset database mock
    db.select.mockReset();
  });
  
  describe('TTL Calculation', () => {
    test('calculateTTL should convert seconds correctly', () => {
      expect(auth.calculateTTL('10s')).toBe(10);
    });
    
    test('calculateTTL should convert minutes correctly', () => {
      expect(auth.calculateTTL('5m')).toBe(300);
    });
    
    test('calculateTTL should convert hours correctly', () => {
      expect(auth.calculateTTL('2h')).toBe(7200);
    });
    
    test('calculateTTL should convert days correctly', () => {
      expect(auth.calculateTTL('3d')).toBe(259200);
    });
    
    test('calculateTTL should handle invalid units', () => {
      expect(auth.calculateTTL('10x')).toBe(10);
    });
  });
  
  describe('Token Generation', () => {
    test('generateToken should create a valid JWT token', () => {
      const token = auth.generateToken(mockUser);
      
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      expect(decoded.id).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.role).toBe(mockUser.role);
    });
    
    test('generateRefreshToken should create a valid refresh token and store token ID', async () => {
      const token = auth.generateRefreshToken(mockUser);
      
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key');
      expect(decoded.id).toBe(mockUser.id);
      expect(decoded.tokenId).toBeTruthy();
      
      // Check if token ID was stored in Redis
      expect(cache.set).toHaveBeenCalledWith(
        expect.stringContaining(mockUser.id),
        decoded.tokenId,
        expect.any(Number)
      );
    });
  });
  
  describe('Token Validation', () => {
    test('validateToken should verify a valid token', async () => {
      const token = auth.generateToken(mockUser);
      cache.exists.mockResolvedValue(false);
      
      const decoded = await auth.validateToken(token);
      expect(decoded.id).toBe(mockUser.id);
    });
    
    test('validateToken should reject a blacklisted token', async () => {
      const token = auth.generateToken(mockUser);
      cache.exists.mockResolvedValue(true);
      
      await expect(auth.validateToken(token)).rejects.toThrow(AuthenticationError);
      await expect(auth.validateToken(token)).rejects.toThrow('Token has been revoked');
    });
    
    test('validateToken should reject an expired token', async () => {
      // Create an expired token
      const token = jwt.sign(
        { id: mockUser.id },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '0s' }
      );
      
      await expect(auth.validateToken(token)).rejects.toThrow(AuthenticationError);
      await expect(auth.validateToken(token)).rejects.toThrow('Token has expired');
    });
    
    test('validateToken should reject an invalid token format', async () => {
      const invalidToken = 'invalid-token-format';
      
      await expect(auth.validateToken(invalidToken)).rejects.toThrow(AuthenticationError);
      await expect(auth.validateToken(invalidToken)).rejects.toThrow('Invalid token format');
    });
    
    test('validateRefreshToken should verify a valid refresh token', async () => {
      const token = auth.generateRefreshToken(mockUser);
      const decoded = jwt.decode(token);
      
      cache.get.mockResolvedValue(decoded.tokenId);
      
      const result = await auth.validateRefreshToken(token);
      expect(result.id).toBe(mockUser.id);
    });
    
    test('validateRefreshToken should reject a revoked refresh token', async () => {
      const token = auth.generateRefreshToken(mockUser);
      cache.get.mockResolvedValue(null);
      
      await expect(auth.validateRefreshToken(token)).rejects.toThrow(AuthenticationError);
      await expect(auth.validateRefreshToken(token)).rejects.toThrow('Refresh token has been revoked');
    });
    
    test('validateRefreshToken should reject an invalid refresh token format', async () => {
      const invalidToken = 'invalid-token-format';
      
      await expect(auth.validateRefreshToken(invalidToken)).rejects.toThrow(AuthenticationError);
      await expect(auth.validateRefreshToken(invalidToken)).rejects.toThrow('Invalid refresh token format');
    });
  });
  
  describe('Token Revocation', () => {
    test('revokeToken should add token to blacklist', async () => {
      const token = auth.generateToken(mockUser);
      
      await auth.revokeToken(token);
      
      expect(cache.set).toHaveBeenCalledWith(
        expect.stringContaining(token),
        'revoked',
        expect.any(Number)
      );
    });
    
    test('revokeRefreshToken should delete refresh token from Redis', async () => {
      await auth.revokeRefreshToken(mockUser.id);
      
      expect(cache.del).toHaveBeenCalledWith(
        expect.stringContaining(mockUser.id)
      );
    });
  });
  
  describe('Authentication Middleware', () => {
    test('authenticate should validate token from Authorization header', async () => {
      const token = auth.generateToken(mockUser);
      const { req, res, next } = createMockReqRes({
        authorization: `Bearer ${token}`
      });
      
      cache.exists.mockResolvedValue(false);
      
      await auth.authenticate(req, res, next);
      
      expect(req.user).toBeTruthy();
      expect(req.user.id).toBe(mockUser.id);
      expect(next).toHaveBeenCalled();
    });
    
    test('authenticate should validate token from cookie', async () => {
      const token = auth.generateToken(mockUser);
      const { req, res, next } = createMockReqRes({}, {
        token
      });
      
      cache.exists.mockResolvedValue(false);
      
      await auth.authenticate(req, res, next);
      
      expect(req.user).toBeTruthy();
      expect(req.user.id).toBe(mockUser.id);
      expect(next).toHaveBeenCalled();
    });
    
    test('authenticate should reject request without token', async () => {
      const { req, res, next } = createMockReqRes();
      
      await auth.authenticate(req, res, next);
      
      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });
  
  describe('Authorization Middleware', () => {
    test('authorize should allow access for matching role', () => {
      const { req, res, next } = createMockReqRes();
      req.user = { ...mockUser, role: 'user' };
      
      const middleware = auth.authorize(['user']);
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
    
    test('authorize should deny access for non-matching role', () => {
      const { req, res, next } = createMockReqRes();
      req.user = { ...mockUser, role: 'user' };
      
      const middleware = auth.authorize(['admin']);
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
    
    test('authorize should deny access without authentication', () => {
      const { req, res, next } = createMockReqRes();
      
      const middleware = auth.authorize(['user']);
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });
  
  describe('Token Refresh', () => {
    test('refreshToken should generate new tokens with valid refresh token', async () => {
      const refreshToken = auth.generateRefreshToken(mockUser);
      const { req, res, next } = createMockReqRes({}, {
        refreshToken
      });
      
      const decoded = jwt.decode(refreshToken);
      cache.get.mockResolvedValue(decoded.tokenId);
      
      // Mock getUserById
      db.select.mockResolvedValue([mockAirtableUser]);
      
      await auth.refreshToken(req, res, next);
      
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          token: expect.any(String),
          refreshToken: expect.any(String)
        })
      );
      
      expect(cache.del).toHaveBeenCalledWith(
        expect.stringContaining(mockUser.id)
      );
    });
    
    test('refreshToken should reject invalid refresh token', async () => {
      const { req, res, next } = createMockReqRes({}, {
        refreshToken: 'invalid-token'
      });
      
      await auth.refreshToken(req, res, next);
      
      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
    
    test('refreshToken should handle database error', async () => {
      const refreshToken = auth.generateRefreshToken(mockUser);
      const { req, res, next } = createMockReqRes({}, {
        refreshToken
      });
      
      const decoded = jwt.decode(refreshToken);
      cache.get.mockResolvedValue(decoded.tokenId);
      
      // Mock database error
      db.select.mockRejectedValue(new Error('Database connection failed'));
      
      await auth.refreshToken(req, res, next);
      
      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });
  
  describe('User Retrieval', () => {
    test('getUserById should fetch user from cache if available', async () => {
      const cachedUser = {
        id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        points: 100,
        preferences: { theme: 'dark' }
      };
      
      // Mock Redis cache hit
      cache.get.mockResolvedValue(JSON.stringify(cachedUser));
      
      const user = await auth.getUserById('user123');
      
      expect(user).toEqual(cachedUser);
      expect(cache.get).toHaveBeenCalledWith('user:user123');
      // Verify Airtable was not queried
      expect(db.select).not.toHaveBeenCalled();
    });
    
    test('getUserById should fetch from Airtable and cache on cache miss', async () => {
      // Mock Redis cache miss
      cache.get.mockResolvedValue(null);
      // Mock Airtable response
      db.select.mockResolvedValue([mockAirtableUser]);
      
      const user = await auth.getUserById('user123');
      
      expect(user).toBeTruthy();
      expect(user.id).toBe('user123');
      expect(user.email).toBe('test@example.com');
      
      // Verify cache was checked
      expect(cache.get).toHaveBeenCalledWith('user:user123');
      // Verify Airtable was queried
      expect(db.select).toHaveBeenCalledWith(
        TABLES.USERS,
        expect.objectContaining({
          filterByFormula: expect.stringContaining('user123'),
          maxRecords: 1
        })
      );
      // Verify user was cached
      expect(cache.set).toHaveBeenCalledWith(
        'user:user123',
        expect.any(String),
        300
      );
    });
    
    test('getUserById should return null for non-existent user', async () => {
      // Mock Redis cache miss
      cache.get.mockResolvedValue(null);
      // Mock empty Airtable response
      db.select.mockResolvedValue([]);
      
      const user = await auth.getUserById('nonexistent');
      
      expect(user).toBeNull();
      // Verify cache was checked but not set
      expect(cache.get).toHaveBeenCalledWith('user:nonexistent');
      expect(cache.set).not.toHaveBeenCalled();
    });
    
    test('getUserById should handle database errors', async () => {
      // Mock Redis cache miss
      cache.get.mockResolvedValue(null);
      // Mock database error
      db.select.mockRejectedValue(new Error('Database connection failed'));
      
      await expect(auth.getUserById('user123')).rejects.toThrow(AuthenticationError);
      await expect(auth.getUserById('user123')).rejects.toThrow('Database error');
    });
    
    test('getUserById should handle missing id', async () => {
      const user = await auth.getUserById(null);
      
      expect(user).toBeNull();
      // Verify cache was not checked
      expect(cache.get).not.toHaveBeenCalled();
    });
  });
  
  describe('Logout', () => {
    test('logout should revoke token and refresh token', async () => {
      const token = auth.generateToken(mockUser);
      const { req, res, next } = createMockReqRes({
        authorization: `Bearer ${token}`
      });
      req.user = mockUser;
      
      await auth.logout(req, res, next);
      
      expect(cache.set).toHaveBeenCalledWith(
        expect.stringContaining(token),
        'revoked',
        expect.any(Number)
      );
      
      expect(cache.del).toHaveBeenCalledWith(
        expect.stringContaining(mockUser.id)
      );
      
      expect(res.clearCookie).toHaveBeenCalledWith('token');
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
      
      expect(res.json).toHaveBeenCalledWith({
        message: 'Logout successful'
      });
    });
    
    test('logout should handle missing tokens gracefully', async () => {
      const { req, res, next } = createMockReqRes();
      
      await auth.logout(req, res, next);
      
      expect(res.json).toHaveBeenCalledWith({
        message: 'Logout successful'
      });
    });
  });
});
// @KI-GEN-END 