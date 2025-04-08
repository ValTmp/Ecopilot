const request = require('supertest');
const app = require('../src/app');
const co2Calculator = require('../src/services/co2Calculator');
const redis = require('../src/config/redis');
const jwt = require('jsonwebtoken');

// Mock co2Calculator
jest.mock('../src/services/co2Calculator', () => ({
  calculateEmissions: jest.fn(),
  getEmissionFactors: jest.fn(),
  saveCalculation: jest.fn(),
  getUserHistory: jest.fn()
}));

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

describe('CO2 Routes', () => {
  let mockToken;
  let mockUser;

  beforeEach(() => {
    mockToken = 'valid-token';
    mockUser = {
      id: 'user123',
      email: 'test@example.com'
    };
    jwt.verify.mockReturnValue({ userId: mockUser.id });
    jest.clearAllMocks();
  });

  describe('POST /api/co2/calculate', () => {
    it('should calculate CO2 emissions successfully', async () => {
      const mockCalculation = {
        transportType: 'car',
        distance: 100,
        emissions: 23
      };

      co2Calculator.calculateEmissions.mockResolvedValue(23);
      co2Calculator.saveCalculation.mockResolvedValue({
        id: 'calc123',
        fields: {
          userId: mockUser.id,
          ...mockCalculation,
          createdAt: new Date().toISOString()
        }
      });

      const response = await request(app)
        .post('/api/co2/calculate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send(mockCalculation);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        emissions: 23,
        calculation: expect.objectContaining({
          id: 'calc123',
          fields: expect.objectContaining(mockCalculation)
        })
      });
      expect(co2Calculator.calculateEmissions).toHaveBeenCalledWith(
        mockCalculation.transportType,
        mockCalculation.distance
      );
      expect(co2Calculator.saveCalculation).toHaveBeenCalledWith({
        userId: mockUser.id,
        ...mockCalculation
      });
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .post('/api/co2/calculate')
        .send({
          transportType: 'car',
          distance: 100
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Authentication token is required'
      });
    });

    it('should reject invalid token', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const response = await request(app)
        .post('/api/co2/calculate')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          transportType: 'car',
          distance: 100
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Invalid token'
      });
    });

    it('should reject missing transport type', async () => {
      const response = await request(app)
        .post('/api/co2/calculate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          distance: 100
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: expect.stringContaining('transportType')
      });
    });

    it('should reject invalid transport type', async () => {
      const response = await request(app)
        .post('/api/co2/calculate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          transportType: 'invalid',
          distance: 100
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: expect.stringContaining('transportType')
      });
    });

    it('should reject missing distance', async () => {
      const response = await request(app)
        .post('/api/co2/calculate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          transportType: 'car'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: expect.stringContaining('distance')
      });
    });

    it('should reject non-positive distance', async () => {
      const response = await request(app)
        .post('/api/co2/calculate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          transportType: 'car',
          distance: 0
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: expect.stringContaining('distance')
      });
    });

    it('should handle calculation errors gracefully', async () => {
      co2Calculator.calculateEmissions.mockRejectedValue(new Error('Calculation error'));

      const response = await request(app)
        .post('/api/co2/calculate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          transportType: 'car',
          distance: 100
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Calculation error'
      });
    });

    it('should handle save errors gracefully', async () => {
      co2Calculator.calculateEmissions.mockResolvedValue(23);
      co2Calculator.saveCalculation.mockRejectedValue(new Error('Save error'));

      const response = await request(app)
        .post('/api/co2/calculate')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          transportType: 'car',
          distance: 100
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Save error'
      });
    });
  });

  describe('GET /api/co2/factors', () => {
    it('should get emission factors from cache', async () => {
      const mockFactors = {
        car: 0.23,
        plane: 0.255,
        public: 0.05
      };

      redis.get.mockResolvedValue(JSON.stringify(mockFactors));

      const response = await request(app)
        .get('/api/co2/factors')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockFactors);
      expect(redis.get).toHaveBeenCalledWith('co2:emission_factors');
      expect(co2Calculator.getEmissionFactors).not.toHaveBeenCalled();
    });

    it('should get emission factors from service if not in cache', async () => {
      const mockFactors = {
        car: 0.23,
        plane: 0.255,
        public: 0.05
      };

      redis.get.mockResolvedValue(null);
      co2Calculator.getEmissionFactors.mockResolvedValue(mockFactors);

      const response = await request(app)
        .get('/api/co2/factors')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockFactors);
      expect(redis.get).toHaveBeenCalledWith('co2:emission_factors');
      expect(co2Calculator.getEmissionFactors).toHaveBeenCalled();
      expect(redis.setex).toHaveBeenCalledWith(
        'co2:emission_factors',
        3600,
        JSON.stringify(mockFactors)
      );
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/co2/factors');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Authentication token is required'
      });
    });

    it('should handle Redis errors gracefully', async () => {
      redis.get.mockRejectedValue(new Error('Redis error'));
      co2Calculator.getEmissionFactors.mockResolvedValue({
        car: 0.23,
        plane: 0.255,
        public: 0.05
      });

      const response = await request(app)
        .get('/api/co2/factors')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        car: 0.23,
        plane: 0.255,
        public: 0.05
      });
    });

    it('should handle service errors gracefully', async () => {
      redis.get.mockResolvedValue(null);
      co2Calculator.getEmissionFactors.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/co2/factors')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Service error'
      });
    });
  });

  describe('GET /api/co2/history', () => {
    it('should get user history from cache', async () => {
      const mockHistory = [
        {
          id: 'calc123',
          fields: {
            userId: mockUser.id,
            transportType: 'car',
            distance: 100,
            emissions: 23,
            createdAt: new Date().toISOString()
          }
        }
      ];

      redis.get.mockResolvedValue(JSON.stringify(mockHistory));

      const response = await request(app)
        .get('/api/co2/history')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockHistory);
      expect(redis.get).toHaveBeenCalledWith(`user:calculations:${mockUser.id}`);
      expect(co2Calculator.getUserHistory).not.toHaveBeenCalled();
    });

    it('should get user history from service if not in cache', async () => {
      const mockHistory = [
        {
          id: 'calc123',
          fields: {
            userId: mockUser.id,
            transportType: 'car',
            distance: 100,
            emissions: 23,
            createdAt: new Date().toISOString()
          }
        }
      ];

      redis.get.mockResolvedValue(null);
      co2Calculator.getUserHistory.mockResolvedValue(mockHistory);

      const response = await request(app)
        .get('/api/co2/history')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockHistory);
      expect(redis.get).toHaveBeenCalledWith(`user:calculations:${mockUser.id}`);
      expect(co2Calculator.getUserHistory).toHaveBeenCalledWith(mockUser.id);
      expect(redis.setex).toHaveBeenCalledWith(
        `user:calculations:${mockUser.id}`,
        300,
        JSON.stringify(mockHistory)
      );
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/co2/history');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Authentication token is required'
      });
    });

    it('should handle Redis errors gracefully', async () => {
      redis.get.mockRejectedValue(new Error('Redis error'));
      co2Calculator.getUserHistory.mockResolvedValue([
        {
          id: 'calc123',
          fields: {
            userId: mockUser.id,
            transportType: 'car',
            distance: 100,
            emissions: 23,
            createdAt: new Date().toISOString()
          }
        }
      ]);

      const response = await request(app)
        .get('/api/co2/history')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
    });

    it('should handle service errors gracefully', async () => {
      redis.get.mockResolvedValue(null);
      co2Calculator.getUserHistory.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/co2/history')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Service error'
      });
    });
  });
}); 