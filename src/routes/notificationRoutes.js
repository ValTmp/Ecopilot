const express = require('express');
const router = express.Router();
const notificationService = require('../services/notificationService');
const auth = require('../middleware/auth');
const validation = require('../middleware/validation');
const logger = require('../services/logger');
const rateLimit = require('../middleware/security').rateLimit;

/**
 * @route GET /api/notifications
 * @description Get user notifications
 * @access Private
 */
router.get('/', 
  auth.verifyToken,
  rateLimit('notifications', 30, 60), // 30 requests per minute
  async (req, res) => {
    try {
      const userId = req.user.id;
      const includeRead = req.query.includeRead === 'true';
      
      const notifications = await notificationService.getUserNotifications(userId, includeRead);
      
      return res.status(200).json({
        success: true,
        count: notifications.length,
        data: notifications
      });
    } catch (error) {
      logger.error('Error fetching notifications', {
        error: error.message,
        userId: req.user.id
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications',
        error: error.message
      });
    }
  }
);

/**
 * @route POST /api/notifications/:id/read
 * @description Mark a notification as read
 * @access Private
 */
router.post('/:id/read',
  auth.verifyToken,
  rateLimit('notifications', 30, 60), // 30 requests per minute
  async (req, res) => {
    try {
      const notificationId = req.params.id;
      
      // Verify the notification belongs to the user
      const notifications = await notificationService.getUserNotifications(req.user.id, true);
      const notification = notifications.find(n => n.id === notificationId);
      
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }
      
      const updatedNotification = await notificationService.markNotificationRead(notificationId);
      
      return res.status(200).json({
        success: true,
        data: updatedNotification
      });
    } catch (error) {
      logger.error('Error marking notification as read', {
        error: error.message,
        notificationId: req.params.id,
        userId: req.user.id
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read',
        error: error.message
      });
    }
  }
);

/**
 * @route DELETE /api/notifications/:id
 * @description Delete a notification
 * @access Private
 */
router.delete('/:id',
  auth.verifyToken,
  rateLimit('notifications', 20, 60), // 20 requests per minute
  async (req, res) => {
    try {
      const notificationId = req.params.id;
      
      // Verify the notification belongs to the user
      const notifications = await notificationService.getUserNotifications(req.user.id, true);
      const notification = notifications.find(n => n.id === notificationId);
      
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }
      
      // Delete notification in Airtable
      const base = notificationService.base;
      const notificationsTable = base('notifications');
      await notificationsTable.destroy(notificationId);
      
      // Invalidate cache
      const redis = require('../config/redis');
      await redis.del(`user:notifications:${req.user.id}`);
      
      return res.status(200).json({
        success: true,
        message: 'Notification deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting notification', {
        error: error.message,
        notificationId: req.params.id,
        userId: req.user.id
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to delete notification',
        error: error.message
      });
    }
  }
);

/**
 * @route POST /api/notifications/mark-all-read
 * @description Mark all notifications as read
 * @access Private
 */
router.post('/mark-all-read',
  auth.verifyToken,
  rateLimit('notifications', 10, 60), // 10 requests per minute
  async (req, res) => {
    try {
      const userId = req.user.id;
      const notifications = await notificationService.getUserNotifications(userId, false);
      
      if (notifications.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No unread notifications',
          count: 0
        });
      }
      
      const updatedCount = await markAllNotificationsRead(notifications);
      
      return res.status(200).json({
        success: true,
        message: 'All notifications marked as read',
        count: updatedCount
      });
    } catch (error) {
      logger.error('Error marking all notifications as read', {
        error: error.message,
        userId: req.user.id
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read',
        error: error.message
      });
    }
  }
);

/**
 * Helper function to mark all notifications as read
 * @param {Array} notifications - Array of notifications
 * @returns {Promise<number>} Count of updated notifications
 */
async function markAllNotificationsRead(notifications) {
  let count = 0;
  
  for (const notification of notifications) {
    try {
      await notificationService.markNotificationRead(notification.id);
      count++;
    } catch (error) {
      logger.error('Error marking notification as read in batch operation', {
        error: error.message,
        notificationId: notification.id
      });
    }
  }
  
  return count;
}

module.exports = router; 