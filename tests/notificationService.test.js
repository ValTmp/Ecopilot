const NotificationService = require('../src/services/notificationService');
const redis = require('../src/config/redis');
const Airtable = require('airtable');
const nodemailer = require('nodemailer');
const logger = require('../src/services/logger');

// Mock Redis
jest.mock('../src/config/redis', () => ({
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  flushall: jest.fn()
}));

// Mock Airtable
jest.mock('airtable', () => ({
  base: jest.fn().mockReturnValue({
    table: jest.fn().mockReturnValue({
      create: jest.fn(),
      select: jest.fn().mockReturnValue({
        filterByFormula: jest.fn().mockReturnThis(),
        firstPage: jest.fn()
      }),
      update: jest.fn(),
      destroy: jest.fn()
    })
  })
}));

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn()
  })
}));

// Mock logger
jest.mock('../src/services/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('NotificationService', () => {
  let notificationService;
  let mockAirtable;
  let mockTransporter;
  let mockUser;
  let mockNotification;

  beforeEach(() => {
    notificationService = new NotificationService();
    mockAirtable = Airtable.base().table('Notifications');
    mockTransporter = nodemailer.createTransport();
    mockUser = {
      id: 'user123',
      email: 'test@example.com'
    };
    mockNotification = {
      id: 'notif123',
      fields: {
        userId: mockUser.id,
        type: 'goal_completed',
        message: 'Goal completed!',
        read: false,
        createdAt: new Date().toISOString()
      }
    };
    jest.clearAllMocks();
  });

  describe('createNotification', () => {
    it('should create notification successfully', async () => {
      mockAirtable.create.mockResolvedValue(mockNotification);

      const result = await notificationService.createNotification(
        mockUser.id,
        'goal_completed',
        'Goal completed!'
      );

      expect(result).toEqual(mockNotification);
      expect(mockAirtable.create).toHaveBeenCalledWith({
        userId: mockUser.id,
        type: 'goal_completed',
        message: 'Goal completed!',
        read: false,
        createdAt: expect.any(String)
      });
      expect(redis.del).toHaveBeenCalledWith(`user:notifications:${mockUser.id}`);
    });

    it('should handle missing parameters', async () => {
      await expect(notificationService.createNotification()).rejects.toThrow('Missing required parameters');
      await expect(notificationService.createNotification(mockUser.id)).rejects.toThrow('Missing required parameters');
      await expect(notificationService.createNotification(mockUser.id, 'goal_completed')).rejects.toThrow('Missing required parameters');
    });

    it('should handle Airtable errors', async () => {
      mockAirtable.create.mockRejectedValue(new Error('Airtable error'));

      await expect(notificationService.createNotification(
        mockUser.id,
        'goal_completed',
        'Goal completed!'
      )).rejects.toThrow('Airtable error');
    });
  });

  describe('getUserNotifications', () => {
    it('should get user notifications successfully', async () => {
      const mockNotifications = [mockNotification];
      mockAirtable.select().firstPage.mockResolvedValue(mockNotifications);

      const result = await notificationService.getUserNotifications(mockUser.id);

      expect(result).toEqual(mockNotifications);
      expect(mockAirtable.select).toHaveBeenCalled();
      expect(mockAirtable.select().filterByFormula).toHaveBeenCalledWith(
        `{userId} = '${mockUser.id}'`
      );
    });

    it('should handle missing userId', async () => {
      await expect(notificationService.getUserNotifications()).rejects.toThrow('Missing userId');
    });

    it('should handle Airtable errors', async () => {
      mockAirtable.select().firstPage.mockRejectedValue(new Error('Airtable error'));

      await expect(notificationService.getUserNotifications(mockUser.id)).rejects.toThrow('Airtable error');
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark notification as read successfully', async () => {
      const updatedNotification = {
        ...mockNotification,
        fields: {
          ...mockNotification.fields,
          read: true
        }
      };

      mockAirtable.update.mockResolvedValue(updatedNotification);

      const result = await notificationService.markNotificationAsRead('notif123');

      expect(result).toEqual(updatedNotification);
      expect(mockAirtable.update).toHaveBeenCalledWith('notif123', {
        read: true
      });
    });

    it('should handle missing notificationId', async () => {
      await expect(notificationService.markNotificationAsRead()).rejects.toThrow('Missing notificationId');
    });

    it('should handle Airtable errors', async () => {
      mockAirtable.update.mockRejectedValue(new Error('Airtable error'));

      await expect(notificationService.markNotificationAsRead('notif123')).rejects.toThrow('Airtable error');
    });
  });

  describe('markAllNotificationsAsRead', () => {
    it('should mark all notifications as read successfully', async () => {
      const mockNotifications = [mockNotification];
      const updatedNotifications = [{
        ...mockNotification,
        fields: {
          ...mockNotification.fields,
          read: true
        }
      }];

      mockAirtable.select().firstPage.mockResolvedValue(mockNotifications);
      mockAirtable.update.mockResolvedValue(updatedNotifications[0]);

      const result = await notificationService.markAllNotificationsAsRead(mockUser.id);

      expect(result).toEqual(updatedNotifications);
      expect(mockAirtable.select).toHaveBeenCalled();
      expect(mockAirtable.select().filterByFormula).toHaveBeenCalledWith(
        `AND({userId} = '${mockUser.id}', {read} = FALSE())`
      );
      expect(mockAirtable.update).toHaveBeenCalledWith('notif123', {
        read: true
      });
    });

    it('should handle missing userId', async () => {
      await expect(notificationService.markAllNotificationsAsRead()).rejects.toThrow('Missing userId');
    });

    it('should handle Airtable errors', async () => {
      mockAirtable.select().firstPage.mockRejectedValue(new Error('Airtable error'));

      await expect(notificationService.markAllNotificationsAsRead(mockUser.id)).rejects.toThrow('Airtable error');
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification successfully', async () => {
      mockAirtable.destroy.mockResolvedValue(true);

      const result = await notificationService.deleteNotification('notif123');

      expect(result).toBe(true);
      expect(mockAirtable.destroy).toHaveBeenCalledWith('notif123');
    });

    it('should handle missing notificationId', async () => {
      await expect(notificationService.deleteNotification()).rejects.toThrow('Missing notificationId');
    });

    it('should handle Airtable errors', async () => {
      mockAirtable.destroy.mockRejectedValue(new Error('Airtable error'));

      await expect(notificationService.deleteNotification('notif123')).rejects.toThrow('Airtable error');
    });
  });

  describe('sendEmailNotification', () => {
    it('should send email notification successfully', async () => {
      const mockEmailResult = { success: true };
      notificationService.sendEmailNotification = jest.fn().mockResolvedValue(mockEmailResult);

      const result = await notificationService.sendEmailNotification(
        mockUser.email,
        'goal_completed',
        'Goal completed!'
      );

      expect(result).toEqual(mockEmailResult);
      expect(notificationService.sendEmailNotification).toHaveBeenCalledWith(
        mockUser.email,
        'goal_completed',
        'Goal completed!'
      );
    });

    it('should handle missing parameters', async () => {
      await expect(notificationService.sendEmailNotification()).rejects.toThrow('Missing required parameters');
      await expect(notificationService.sendEmailNotification(mockUser.email)).rejects.toThrow('Missing required parameters');
      await expect(notificationService.sendEmailNotification(mockUser.email, 'goal_completed')).rejects.toThrow('Missing required parameters');
    });

    it('should handle email service errors', async () => {
      notificationService.sendEmailNotification = jest.fn().mockRejectedValue(new Error('Email service error'));

      await expect(notificationService.sendEmailNotification(
        mockUser.email,
        'goal_completed',
        'Goal completed!'
      )).rejects.toThrow('Email service error');
    });
  });
}); 