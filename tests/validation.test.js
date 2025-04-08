const validation = require('../src/middleware/validation');
const Joi = require('joi');

describe('Validation Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('validateBody', () => {
    it('should validate request body successfully', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        email: Joi.string().email().required(),
        age: Joi.number().min(18).required()
      });

      mockReq.body = {
        name: 'Test User',
        email: 'test@example.com',
        age: 25
      };

      validation.validateBody(schema)(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid request body', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        email: Joi.string().email().required(),
        age: Joi.number().min(18).required()
      });

      mockReq.body = {
        name: 'Test User',
        email: 'invalid-email',
        age: 17
      };

      validation.validateBody(schema)(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('email')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject missing required fields', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        email: Joi.string().email().required(),
        age: Joi.number().min(18).required()
      });

      mockReq.body = {
        name: 'Test User'
      };

      validation.validateBody(schema)(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('email')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateQuery', () => {
    it('should validate query parameters successfully', () => {
      const schema = Joi.object({
        page: Joi.number().min(1).default(1),
        limit: Joi.number().min(1).max(100).default(10),
        sort: Joi.string().valid('asc', 'desc').default('desc')
      });

      mockReq.query = {
        page: '2',
        limit: '20',
        sort: 'asc'
      };

      validation.validateQuery(schema)(mockReq, mockRes, mockNext);

      expect(mockReq.query).toEqual({
        page: 2,
        limit: 20,
        sort: 'asc'
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use default values for missing parameters', () => {
      const schema = Joi.object({
        page: Joi.number().min(1).default(1),
        limit: Joi.number().min(1).max(100).default(10),
        sort: Joi.string().valid('asc', 'desc').default('desc')
      });

      mockReq.query = {};

      validation.validateQuery(schema)(mockReq, mockRes, mockNext);

      expect(mockReq.query).toEqual({
        page: 1,
        limit: 10,
        sort: 'desc'
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid query parameters', () => {
      const schema = Joi.object({
        page: Joi.number().min(1).default(1),
        limit: Joi.number().min(1).max(100).default(10),
        sort: Joi.string().valid('asc', 'desc').default('desc')
      });

      mockReq.query = {
        page: '0',
        limit: '200',
        sort: 'invalid'
      };

      validation.validateQuery(schema)(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('page')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateParams', () => {
    it('should validate route parameters successfully', () => {
      const schema = Joi.object({
        userId: Joi.string().required(),
        postId: Joi.string().required()
      });

      mockReq.params = {
        userId: 'user123',
        postId: 'post456'
      };

      validation.validateParams(schema)(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject missing required parameters', () => {
      const schema = Joi.object({
        userId: Joi.string().required(),
        postId: Joi.string().required()
      });

      mockReq.params = {
        userId: 'user123'
      };

      validation.validateParams(schema)(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('postId')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid parameter format', () => {
      const schema = Joi.object({
        userId: Joi.string().required(),
        postId: Joi.string().required()
      });

      mockReq.params = {
        userId: '',
        postId: 'post456'
      };

      validation.validateParams(schema)(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('userId')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateCo2Calculation', () => {
    it('should validate CO2 calculation input successfully', () => {
      mockReq.body = {
        transportType: 'car',
        distance: 100
      };

      validation.validateCo2Calculation(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject missing transport type', () => {
      mockReq.body = {
        distance: 100
      };

      validation.validateCo2Calculation(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('transportType')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid transport type', () => {
      mockReq.body = {
        transportType: 'invalid',
        distance: 100
      };

      validation.validateCo2Calculation(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('transportType')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject missing distance', () => {
      mockReq.body = {
        transportType: 'car'
      };

      validation.validateCo2Calculation(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('distance')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject non-positive distance', () => {
      mockReq.body = {
        transportType: 'car',
        distance: 0
      };

      validation.validateCo2Calculation(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('distance')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateGoalCreation', () => {
    it('should validate goal creation input successfully', () => {
      mockReq.body = {
        type: 'reduce_car',
        target: 50,
        deadline: '2025-12-31'
      };

      validation.validateGoalCreation(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject missing goal type', () => {
      mockReq.body = {
        target: 50,
        deadline: '2025-12-31'
      };

      validation.validateGoalCreation(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('type')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid goal type', () => {
      mockReq.body = {
        type: 'invalid',
        target: 50,
        deadline: '2025-12-31'
      };

      validation.validateGoalCreation(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('type')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject missing target', () => {
      mockReq.body = {
        type: 'reduce_car',
        deadline: '2025-12-31'
      };

      validation.validateGoalCreation(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('target')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject non-positive target', () => {
      mockReq.body = {
        type: 'reduce_car',
        target: 0,
        deadline: '2025-12-31'
      };

      validation.validateGoalCreation(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('target')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject missing deadline', () => {
      mockReq.body = {
        type: 'reduce_car',
        target: 50
      };

      validation.validateGoalCreation(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('deadline')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid deadline format', () => {
      mockReq.body = {
        type: 'reduce_car',
        target: 50,
        deadline: 'invalid-date'
      };

      validation.validateGoalCreation(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('deadline')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject past deadline', () => {
      mockReq.body = {
        type: 'reduce_car',
        target: 50,
        deadline: '2020-12-31'
      };

      validation.validateGoalCreation(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('deadline')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
}); 