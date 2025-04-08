const request = require('supertest');
const app = require('../src/app');
const notificationService = require('../src/services/notificationService');
const redis = require('../src/config/redis');
const jwt = require('jsonwebtoken');

// Mock notificationService
jest.mock('../src/services/notificationService', () => ({
  createNotification: jest.fn(),
  getUserNotifications: jest.fn(),
  markNotificationAsRead: jest.fn(),
  markAllNotificationsAsRead: jest.fn(),
  deleteNotification: jest.fn(),
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

describe('Notification Routes', () => {
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

  describe('GET /api/notifications', () => {
    it('should get user notifications from cache', async () => {
      const mockNotifications = [
        {
          id: 'notif123',
          fields: {
            userId: mockUser.id,
            type: 'goal_completed',
            message: 'Goal completed!',
            read: false,
            createdAt: new Date().toISOString()
          }
        }
      ];

      redis.get.mockResolvedValue(JSON.stringify(mockNotifications));

      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockNotifications);
      expect(redis.get).toHaveBeenCalledWith(`user:notifications:${mockUser.id}`);
      expect(notificationService.getUserNotifications).not.toHaveBeenCalled();
    });

    it('should get user notifications from service if not in cache', async () => {
      const mockNotifications = [
        {
          id: 'notif123',
          fields: {
            userId: mockUser.id,
            type: 'goal_completed',
            message: 'Goal completed!',
            read: false,
            createdAt: new Date().toISOString()
          }
        }
      ];

      redis.get.mockResolvedValue(null);
      notificationService.getUserNotifications.mockResolvedValue(mockNotifications);

      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockNotifications);
      expect(redis.get).toHaveBeenCalledWith(`user:notifications:${mockUser.id}`);
      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(mockUser.id);
      expect(redis.setex).toHaveBeenCalledWith(
        `user:notifications:${mockUser.id}`,
        300,
        JSON.stringify(mockNotifications)
      );
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/notifications');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Authentication token is required'
      });
    });

    it('should handle Redis errors gracefully', async () => {
      redis.get.mockRejectedValue(new Error('Redis error'));
      notificationService.getUserNotifications.mockResolvedValue([
        {
          id: 'notif123',
          fields: {
            userId: mockUser.id,
            type: 'goal_completed',
            message: 'Goal completed!',
            read: false,
            createdAt: new Date().toISOString()
          }
        }
      ]);

      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
    });

    it('should handle service errors gracefully', async () => {
      redis.get.mockResolvedValue(null);
      notificationService.getUserNotifications.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Service error'
      });
    });
  });

  describe('PUT /api/notifications/:notificationId/read', () => {
    it('should mark notification as read successfully', async () => {
      const mockNotification = {
        id: 'notif123',
        fields: {
          userId: mockUser.id,
          type: 'goal_completed',
          message: 'Goal completed!',
          read: true,
          createdAt: new Date().toISOString()
        }
      };

      notificationService.markNotificationAsRead.mockResolvedValue(mockNotification);

      const response = await request(app)
        .put('/api/notifications/notif123/read')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockNotification);
      expect(notificationService.markNotificationAsRead).toHaveBeenCalledWith('notif123');
      expect(redis.del).toHaveBeenCalledWith(`user:notifications:${mockUser.id}`);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .put('/api/notifications/notif123/read');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Authentication token is required'
      });
    });

    it('should handle service errors gracefully', async () => {
      notificationService.markNotificationAsRead.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .put('/api/notifications/notif123/read')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Service error'
      });
    });
  });

  describe('PUT /api/notifications/read-all', () => {
    it('should mark all notifications as read successfully', async () => {
      const mockNotifications = [
        {
          id: 'notif123',
          fields: {
            userId: mockUser.id,
            type: 'goal_completed',
            message: 'Goal completed!',
            read: true,
            createdAt: new Date().toISOString()
          }
        }
      ];

      notificationService.markAllNotificationsAsRead.mockResolvedValue(mockNotifications);

      const response = await request(app)
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockNotifications);
      expect(notificationService.markAllNotificationsAsRead).toHaveBeenCalledWith(mockUser.id);
      expect(redis.del).toHaveBeenCalledWith(`user:notifications:${mockUser.id}`);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .put('/api/notifications/read-all');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Authentication token is required'
      });
    });

    it('should handle service errors gracefully', async () => {
      notificationService.markAllNotificationsAsRead.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Service error'
      });
    });
  });

  describe('DELETE /api/notifications/:notificationId', () => {
    it('should delete notification successfully', async () => {
      notificationService.deleteNotification.mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/notifications/notif123')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(204);
      expect(notificationService.deleteNotification).toHaveBeenCalledWith('notif123');
      expect(redis.del).toHaveBeenCalledWith(`user:notifications:${mockUser.id}`);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .delete('/api/notifications/notif123');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Authentication token is required'
      });
    });

    it('should handle service errors gracefully', async () => {
      notificationService.deleteNotification.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .delete('/api/notifications/notif123')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Service error'
      });
    });
  });
}); 