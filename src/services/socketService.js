const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const redis = require('../config/redis');
const logger = require('./logger');

let io;

/**
 * Initialize the Socket.IO server
 * @param {Object} server - HTTP server instance
 */
function initialize(server) {
  io = socketIo(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }
      
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (!decoded || !decoded.id) {
        return next(new Error('Authentication error: Invalid token'));
      }
      
      // Store user data in socket
      socket.userId = decoded.id;
      socket.user = decoded;
      
      next();
    } catch (error) {
      logger.error('Socket authentication error', {
        error: error.message
      });
      
      next(new Error('Authentication error'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    logger.info('New socket connection', {
      userId: socket.userId,
      socketId: socket.id
    });
    
    // Store socket ID in Redis for user
    redis.sadd(`user:sockets:${socket.userId}`, socket.id);
    
    // Join user-specific room
    socket.join(`user:${socket.userId}`);
    
    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info('Socket disconnected', {
        userId: socket.userId,
        socketId: socket.id
      });
      
      // Remove socket ID from Redis
      redis.srem(`user:sockets:${socket.userId}`, socket.id);
    });
    
    // Mark notification as read
    socket.on('notification:read', async (data) => {
      try {
        if (!data.notificationId) {
          return socket.emit('error', { message: 'Notification ID is required' });
        }
        
        // Load notificationService dynamically to avoid circular dependencies
        const notificationService = require('./notificationService');
        
        await notificationService.markNotificationRead(data.notificationId);
        
        // Emit updated badge count
        emitNotificationBadgeUpdate(socket.userId);
      } catch (error) {
        logger.error('Error marking notification as read via socket', {
          error: error.message,
          userId: socket.userId,
          notificationId: data.notificationId
        });
        
        socket.emit('error', { message: error.message });
      }
    });
    
    // Mark all notifications as read
    socket.on('notification:read:all', async () => {
      try {
        // Load notificationService dynamically to avoid circular dependencies
        const notificationService = require('./notificationService');
        
        // Get user's unread notifications
        const result = await notificationService.getUserNotifications(socket.userId, false);
        
        if (result.length === 0) {
          return socket.emit('notification:read:all:result', { success: true, count: 0 });
        }
        
        let count = 0;
        
        // Mark each notification as read
        for (const notification of result) {
          await notificationService.markNotificationRead(notification.id);
          count++;
        }
        
        // Emit updated badge count
        emitNotificationBadgeUpdate(socket.userId);
        
        socket.emit('notification:read:all:result', { success: true, count });
      } catch (error) {
        logger.error('Error marking all notifications as read via socket', {
          error: error.message,
          userId: socket.userId
        });
        
        socket.emit('error', { message: error.message });
      }
    });
    
    // Request notification badge update
    socket.on('notification:badge:update', async () => {
      emitNotificationBadgeUpdate(socket.userId);
    });
  });

  logger.info('Socket.IO initialized');
}

/**
 * Emit notification to specific user
 * @param {string} userId - User ID
 * @param {Object} notification - Notification data
 */
function emitNotification(userId, notification) {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit notification');
    return;
  }
  
  io.to(`user:${userId}`).emit('notification:new', notification);
  
  // Also update the badge count
  emitNotificationBadgeUpdate(userId);
}

/**
 * Emit notification badge update to user
 * @param {string} userId - User ID
 */
async function emitNotificationBadgeUpdate(userId) {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit badge update');
    return;
  }
  
  try {
    // Load notificationService dynamically to avoid circular dependencies
    const notificationService = require('./notificationService');
    
    // Get unread notification count
    const unreadNotifications = await notificationService.getUserNotifications(userId, false);
    const count = unreadNotifications.length;
    
    io.to(`user:${userId}`).emit('notification:badge:update', { count });
  } catch (error) {
    logger.error('Error updating notification badge count via socket', {
      error: error.message,
      userId
    });
  }
}

module.exports = {
  initialize,
  emitNotification,
  emitNotificationBadgeUpdate
}; 