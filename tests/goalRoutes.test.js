const request = require('supertest');
const app = require('../src/app');
const goalService = require('../src/services/goalService');
const notificationService = require('../src/services/notificationService');
const redis = require('../src/config/redis');
const jwt = require('jsonwebtoken');

// Mock goalService
jest.mock('../src/services/goalService', () => ({
  createGoal: jest.fn(),
  getUserGoals: jest.fn(),
  updateGoalProgress: jest.fn(),
  getGoalStats: jest.fn(),
  updateCustomGoalProgress: jest.fn(),
  getAvailableGoalTypes: jest.fn()
}));

// Mock notificationService
jest.mock('../src/services/notificationService', () => ({
  createNotification: jest.fn(),
  sendEmailNotification: jest.fn()
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

describe('Goal Routes', () => {
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

  describe('POST /api/goals', () => {
    it('should create a goal successfully', async () => {
      const mockGoal = {
        type: 'transport',
        target: 100,
        deadline: '2024-12-31'
      };

      goalService.createGoal.mockResolvedValue({
        id: 'goal123',
        fields: {
          userId: mockUser.id,
          ...mockGoal,
          status: 'active',
          progress: 0,
          createdAt: new Date().toISOString()
        }
      });

      const response = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${mockToken}`)
        .send(mockGoal);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: 'goal123',
        fields: expect.objectContaining({
          userId: mockUser.id,
          ...mockGoal,
          status: 'active',
          progress: 0
        })
      });
      expect(goalService.createGoal).toHaveBeenCalledWith({
        userId: mockUser.id,
        ...mockGoal
      });
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .post('/api/goals')
        .send({
          type: 'transport',
          target: 100,
          deadline: '2024-12-31'
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Authentication token is required'
      });
    });

    it('should reject missing goal type', async () => {
      const response = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          target: 100,
          deadline: '2024-12-31'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: expect.stringContaining('type')
      });
    });

    it('should reject invalid goal type', async () => {
      const response = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          type: 'invalid',
          target: 100,
          deadline: '2024-12-31'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: expect.stringContaining('type')
      });
    });

    it('should reject missing target', async () => {
      const response = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          type: 'transport',
          deadline: '2024-12-31'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: expect.stringContaining('target')
      });
    });

    it('should reject non-positive target', async () => {
      const response = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          type: 'transport',
          target: 0,
          deadline: '2024-12-31'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: expect.stringContaining('target')
      });
    });

    it('should reject missing deadline', async () => {
      const response = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          type: 'transport',
          target: 100
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: expect.stringContaining('deadline')
      });
    });

    it('should reject past deadline', async () => {
      const response = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          type: 'transport',
          target: 100,
          deadline: '2020-12-31'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: expect.stringContaining('deadline')
      });
    });

    it('should handle service errors gracefully', async () => {
      goalService.createGoal.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          type: 'transport',
          target: 100,
          deadline: '2024-12-31'
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Service error'
      });
    });
  });

  describe('GET /api/goals', () => {
    it('should get user goals from cache', async () => {
      const mockGoals = [
        {
          id: 'goal123',
          fields: {
            userId: mockUser.id,
            type: 'transport',
            target: 100,
            deadline: '2024-12-31',
            status: 'active',
            progress: 0,
            createdAt: new Date().toISOString()
          }
        }
      ];

      redis.get.mockResolvedValue(JSON.stringify(mockGoals));

      const response = await request(app)
        .get('/api/goals')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockGoals);
      expect(redis.get).toHaveBeenCalledWith(`user:goals:${mockUser.id}`);
      expect(goalService.getUserGoals).not.toHaveBeenCalled();
    });

    it('should get user goals from service if not in cache', async () => {
      const mockGoals = [
        {
          id: 'goal123',
          fields: {
            userId: mockUser.id,
            type: 'transport',
            target: 100,
            deadline: '2024-12-31',
            status: 'active',
            progress: 0,
            createdAt: new Date().toISOString()
          }
        }
      ];

      redis.get.mockResolvedValue(null);
      goalService.getUserGoals.mockResolvedValue(mockGoals);

      const response = await request(app)
        .get('/api/goals')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockGoals);
      expect(redis.get).toHaveBeenCalledWith(`user:goals:${mockUser.id}`);
      expect(goalService.getUserGoals).toHaveBeenCalledWith(mockUser.id);
      expect(redis.setex).toHaveBeenCalledWith(
        `user:goals:${mockUser.id}`,
        300,
        JSON.stringify(mockGoals)
      );
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/goals');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Authentication token is required'
      });
    });

    it('should handle Redis errors gracefully', async () => {
      redis.get.mockRejectedValue(new Error('Redis error'));
      goalService.getUserGoals.mockResolvedValue([
        {
          id: 'goal123',
          fields: {
            userId: mockUser.id,
            type: 'transport',
            target: 100,
            deadline: '2024-12-31',
            status: 'active',
            progress: 0,
            createdAt: new Date().toISOString()
          }
        }
      ]);

      const response = await request(app)
        .get('/api/goals')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
    });

    it('should handle service errors gracefully', async () => {
      redis.get.mockResolvedValue(null);
      goalService.getUserGoals.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/goals')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Service error'
      });
    });
  });

  describe('PUT /api/goals/:goalId/progress', () => {
    it('should update goal progress successfully', async () => {
      const mockProgress = {
        progress: 50
      };

      goalService.updateGoalProgress.mockResolvedValue({
        id: 'goal123',
        fields: {
          userId: mockUser.id,
          type: 'transport',
          target: 100,
          deadline: '2024-12-31',
          status: 'active',
          progress: 50,
          createdAt: new Date().toISOString()
        }
      });

      const response = await request(app)
        .put('/api/goals/goal123/progress')
        .set('Authorization', `Bearer ${mockToken}`)
        .send(mockProgress);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'goal123',
        fields: expect.objectContaining({
          userId: mockUser.id,
          progress: 50
        })
      });
      expect(goalService.updateGoalProgress).toHaveBeenCalledWith(
        'goal123',
        50
      );
      expect(redis.del).toHaveBeenCalledWith(`user:goals:${mockUser.id}`);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .put('/api/goals/goal123/progress')
        .send({
          progress: 50
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Authentication token is required'
      });
    });

    it('should reject missing progress', async () => {
      const response = await request(app)
        .put('/api/goals/goal123/progress')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: expect.stringContaining('progress')
      });
    });

    it('should reject invalid progress', async () => {
      const response = await request(app)
        .put('/api/goals/goal123/progress')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          progress: 150
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: expect.stringContaining('progress')
      });
    });

    it('should handle service errors gracefully', async () => {
      goalService.updateGoalProgress.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .put('/api/goals/goal123/progress')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          progress: 50
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Service error'
      });
    });
  });

  describe('GET /api/goals/stats', () => {
    it('should get goal stats successfully', async () => {
      const mockStats = {
        total: 5,
        active: 3,
        completed: 1,
        failed: 1
      };

      goalService.getGoalStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/goals/stats')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStats);
      expect(goalService.getGoalStats).toHaveBeenCalledWith(mockUser.id);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/goals/stats');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Authentication token is required'
      });
    });

    it('should handle service errors gracefully', async () => {
      goalService.getGoalStats.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/goals/stats')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Service error'
      });
    });
  });

  describe('GET /api/goals/types', () => {
    it('should get available goal types successfully', async () => {
      const mockTypes = [
        {
          id: 'transport',
          name: 'Transport',
          description: 'Reduce transport emissions',
          unit: 'km'
        }
      ];

      goalService.getAvailableGoalTypes.mockResolvedValue(mockTypes);

      const response = await request(app)
        .get('/api/goals/types');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTypes);
      expect(goalService.getAvailableGoalTypes).toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      goalService.getAvailableGoalTypes.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/goals/types');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Service error'
      });
    });
  });
}); 