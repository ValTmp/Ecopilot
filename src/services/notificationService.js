const nodemailer = require('nodemailer');
const Airtable = require('airtable');
const redis = require('../config/redis');
const logger = require('./logger');

// Cache TTL for notifications (1 hour)
const CACHE_TTL = 3600;

// Cache key prefix for user notifications
const NOTIFICATION_CACHE_PREFIX = 'user:notifications:';

// Email template types
const TEMPLATE_TYPES = {
  GOAL_COMPLETED: 'goal_completed',
  GOAL_PROGRESS: 'goal_progress',
  GOAL_DEADLINE_APPROACHING: 'goal_deadline_approaching',
  GOAL_CREATED: 'goal_created',
  EMISSIONS_INCREASE: 'emissions_increase',
  WEEKLY_SUMMARY: 'weekly_summary'
};

// Notification status
const NOTIFICATION_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed'
};

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

const notificationsTable = base('notifications');

// Initialize nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

/**
 * Create a notification for a user
 * @param {string} userId - User ID
 * @param {string} type - Notification template type
 * @param {Object} data - Data for notification template
 * @param {boolean} sendEmail - Whether to send an email immediately
 * @returns {Promise<Object>} Created notification
 */
async function createNotification(userId, type, data, sendEmail = false) {
  if (!userId) throw new Error('User ID is required');
  if (!Object.values(TEMPLATE_TYPES).includes(type)) {
    throw new Error(`Invalid template type. Must be one of: ${Object.values(TEMPLATE_TYPES).join(', ')}`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Data object is required');
  }
  
  try {
    // Create notification in Airtable
    const notification = {
      userId,
      type,
      data: JSON.stringify(data),
      status: NOTIFICATION_STATUS.PENDING,
      createdAt: new Date().toISOString()
    };
    
    const record = await notificationsTable.create(notification);
    
    // Invalidate cache
    await redis.del(`${NOTIFICATION_CACHE_PREFIX}${userId}`);
    
    // Transform the notification for response
    const formattedNotification = {
      id: record.id,
      ...notification,
      data
    };
    
    // Send email if requested
    if (sendEmail) {
      await sendNotificationEmail(record.id);
    }
    
    // Send real-time notification if socket service is available
    try {
      // We require the socket service here to avoid circular dependencies
      const socketService = require('./socketService');
      socketService.emitNotification(userId, formattedNotification);
      logger.info('Real-time notification sent', {
        userId,
        notificationId: record.id,
        type
      });
    } catch (socketError) {
      // Don't fail if socket service is not available
      logger.warn('Could not send real-time notification', {
        error: socketError.message,
        userId,
        notificationId: record.id
      });
    }
    
    return formattedNotification;
  } catch (error) {
    logger.error('Error creating notification', {
      error: error.message,
      userId,
      type
    });
    throw new Error(`Failed to create notification: ${error.message}`);
  }
}

/**
 * Get user notifications
 * @param {string} userId - User ID
 * @param {boolean} includeRead - Whether to include read notifications
 * @returns {Promise<Array>} User notifications
 */
async function getUserNotifications(userId, includeRead = false) {
  if (!userId) throw new Error('User ID is required');
  
  try {
    // Check cache first
    const cacheKey = `${NOTIFICATION_CACHE_PREFIX}${userId}`;
    const cachedNotifications = await redis.get(cacheKey);
    
    if (cachedNotifications) {
      logger.info(`Cache hit for user notifications: ${userId}`);
      const parsed = JSON.parse(cachedNotifications);
      return includeRead ? parsed : parsed.filter(n => !n.readAt);
    }
    
    logger.info(`Cache miss for user notifications: ${userId}`);
    
    // Query Airtable
    const records = await notificationsTable.select({
      filterByFormula: `{userId} = '${userId}'`,
      sort: [{ field: 'createdAt', direction: 'desc' }]
    }).all();
    
    // Transform records
    const notifications = records.map(record => {
      const fields = record.fields;
      let data;
      
      try {
        data = JSON.parse(fields.data || '{}');
      } catch (e) {
        data = {};
      }
      
      return {
        id: record.id,
        userId: fields.userId,
        type: fields.type,
        data,
        status: fields.status,
        createdAt: fields.createdAt,
        sentAt: fields.sentAt,
        readAt: fields.readAt
      };
    });
    
    // Cache the results
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(notifications));
    
    // Filter if needed
    return includeRead ? notifications : notifications.filter(n => !n.readAt);
  } catch (error) {
    logger.error('Error retrieving user notifications', {
      error: error.message,
      userId
    });
    throw new Error(`Failed to retrieve user notifications: ${error.message}`);
  }
}

/**
 * Mark notification as read
 * @param {string} notificationId - Notification ID
 * @returns {Promise<Object>} Updated notification
 */
async function markNotificationRead(notificationId) {
  if (!notificationId) throw new Error('Notification ID is required');
  
  try {
    // Get the notification
    const record = await notificationsTable.find(notificationId);
    
    if (!record) {
      throw new Error(`Notification with ID ${notificationId} not found`);
    }
    
    // Update the notification
    const updatedRecord = await notificationsTable.update(notificationId, {
      readAt: new Date().toISOString()
    });
    
    // Invalidate cache
    await redis.del(`${NOTIFICATION_CACHE_PREFIX}${record.fields.userId}`);
    
    // Format response
    let data;
    try {
      data = JSON.parse(updatedRecord.fields.data || '{}');
    } catch (e) {
      data = {};
    }
    
    return {
      id: updatedRecord.id,
      userId: updatedRecord.fields.userId,
      type: updatedRecord.fields.type,
      data,
      status: updatedRecord.fields.status,
      createdAt: updatedRecord.fields.createdAt,
      sentAt: updatedRecord.fields.sentAt,
      readAt: updatedRecord.fields.readAt
    };
  } catch (error) {
    logger.error('Error marking notification as read', {
      error: error.message,
      notificationId
    });
    throw new Error(`Failed to mark notification as read: ${error.message}`);
  }
}

/**
 * Send notification email
 * @param {string} notificationId - Notification ID
 * @returns {Promise<boolean>} Whether the email was sent
 */
async function sendNotificationEmail(notificationId) {
  if (!notificationId) throw new Error('Notification ID is required');
  
  try {
    // Get the notification
    const record = await notificationsTable.find(notificationId);
    
    if (!record) {
      throw new Error(`Notification with ID ${notificationId} not found`);
    }
    
    // Skip if already sent
    if (record.fields.status === NOTIFICATION_STATUS.SENT) {
      return true;
    }
    
    // Get user info
    const userId = record.fields.userId;
    const userRecord = await base('users').select({
      filterByFormula: `{id} = '${userId}'`
    }).firstPage();
    
    if (!userRecord || userRecord.length === 0) {
      throw new Error(`User with ID ${userId} not found`);
    }
    
    const userData = userRecord[0].fields;
    const userEmail = userData.email;
    
    if (!userEmail) {
      throw new Error(`No email found for user ${userId}`);
    }
    
    // Get notification data
    const type = record.fields.type;
    let data;
    try {
      data = JSON.parse(record.fields.data || '{}');
    } catch (e) {
      data = {};
    }
    
    // Generate email content
    const emailContent = generateEmailContent(type, data, userData);
    
    // Send email
    const mailOptions = {
      from: `"EcoPilot" <${process.env.EMAIL_FROM}>`,
      to: userEmail,
      subject: emailContent.subject,
      html: emailContent.body
    };
    
    await transporter.sendMail(mailOptions);
    
    // Update notification status
    await notificationsTable.update(notificationId, {
      status: NOTIFICATION_STATUS.SENT,
      sentAt: new Date().toISOString()
    });
    
    logger.info('Notification email sent', {
      notificationId,
      userId,
      type
    });
    
    // Invalidate cache
    await redis.del(`${NOTIFICATION_CACHE_PREFIX}${userId}`);
    
    return true;
  } catch (error) {
    logger.error('Error sending notification email', {
      error: error.message,
      notificationId
    });
    
    // Update notification status to failed
    try {
      await notificationsTable.update(notificationId, {
        status: NOTIFICATION_STATUS.FAILED
      });
    } catch (updateError) {
      logger.error('Error updating notification status', {
        error: updateError.message,
        notificationId
      });
    }
    
    return false;
  }
}

/**
 * Generate email content based on template type
 * @param {string} type - Template type
 * @param {Object} data - Template data
 * @param {Object} userData - User data
 * @returns {Object} Email content with subject and body
 */
function generateEmailContent(type, data, userData) {
  const userName = userData.name || 'there';
  let subject = 'EcoPilot Notification';
  let body = '';
  
  switch (type) {
    case TEMPLATE_TYPES.GOAL_COMPLETED:
      subject = '🎉 Congratulations! You\'ve Completed Your CO2 Reduction Goal';
      body = `
        <h1>Goal Completed!</h1>
        <p>Hi ${userName},</p>
        <p>Congratulations on completing your goal: <strong>${data.goalDescription || 'CO2 reduction goal'}</strong>!</p>
        <p>You've made a real impact on reducing carbon emissions. Here's what you've achieved:</p>
        <ul>
          <li>Goal type: ${data.goalType || 'Not specified'}</li>
          <li>Target: ${data.target || 0}%</li>
          <li>Date completed: ${new Date().toLocaleDateString()}</li>
        </ul>
        <p>Your commitment to sustainability is making a difference. Keep up the great work!</p>
        <p>Want to set a new goal? <a href="${process.env.APP_URL}/goals/create">Click here</a> to create one.</p>
        <p>The EcoPilot Team</p>
      `;
      break;
      
    case TEMPLATE_TYPES.GOAL_PROGRESS:
      subject = '📊 Update on Your CO2 Reduction Goal Progress';
      body = `
        <h1>Goal Progress Update</h1>
        <p>Hi ${userName},</p>
        <p>You're making great progress on your goal: <strong>${data.goalDescription || 'CO2 reduction goal'}</strong>!</p>
        <p>Current progress: <strong>${data.progress || 0}%</strong> complete</p>
        <p>Keep up the good work! You're making a real difference for the environment.</p>
        <p><a href="${process.env.APP_URL}/goals">View all your goals</a></p>
        <p>The EcoPilot Team</p>
      `;
      break;
      
    case TEMPLATE_TYPES.GOAL_DEADLINE_APPROACHING:
      subject = '⏰ Your CO2 Reduction Goal Deadline is Approaching';
      body = `
        <h1>Goal Deadline Approaching</h1>
        <p>Hi ${userName},</p>
        <p>The deadline for your goal is coming up soon: <strong>${data.goalDescription || 'CO2 reduction goal'}</strong></p>
        <p>Details:</p>
        <ul>
          <li>Deadline: ${data.deadline ? new Date(data.deadline).toLocaleDateString() : 'Not specified'}</li>
          <li>Current progress: ${data.progress || 0}%</li>
          <li>Days remaining: ${data.daysRemaining || 'Not specified'}</li>
        </ul>
        <p>There's still time to reach your goal! <a href="${process.env.APP_URL}/goals">Check your goals</a> and see what you can do to make progress.</p>
        <p>The EcoPilot Team</p>
      `;
      break;
      
    case TEMPLATE_TYPES.GOAL_CREATED:
      subject = '🌱 New CO2 Reduction Goal Created';
      body = `
        <h1>New Goal Created</h1>
        <p>Hi ${userName},</p>
        <p>You've successfully created a new goal: <strong>${data.goalDescription || 'CO2 reduction goal'}</strong></p>
        <p>Details:</p>
        <ul>
          <li>Goal type: ${data.goalType || 'Not specified'}</li>
          <li>Target: ${data.target || 0}%</li>
          <li>Deadline: ${data.deadline ? new Date(data.deadline).toLocaleDateString() : 'Not specified'}</li>
        </ul>
        <p>We'll keep you updated on your progress. Good luck!</p>
        <p><a href="${process.env.APP_URL}/goals">View all your goals</a></p>
        <p>The EcoPilot Team</p>
      `;
      break;
      
    case TEMPLATE_TYPES.EMISSIONS_INCREASE:
      subject = '⚠️ Alert: Increase in Your CO2 Emissions';
      body = `
        <h1>Emissions Increase Detected</h1>
        <p>Hi ${userName},</p>
        <p>We've noticed an increase in your CO2 emissions compared to your previous average.</p>
        <p>Recent emissions: <strong>${data.recentEmissions || 0} kg CO2</strong></p>
        <p>Previous average: <strong>${data.previousAverage || 0} kg CO2</strong></p>
        <p>Increase: <strong>${data.increasePercentage || 0}%</strong></p>
        <p>This might affect your progress towards your reduction goals. Here are some tips to help reduce your emissions:</p>
        <ul>
          <li>Consider using public transportation when possible</li>
          <li>Carpool or combine trips to reduce car usage</li>
          <li>Explore video conferencing options instead of travel for meetings</li>
        </ul>
        <p><a href="${process.env.APP_URL}/dashboard">View your emissions dashboard</a> for more insights.</p>
        <p>The EcoPilot Team</p>
      `;
      break;
      
    case TEMPLATE_TYPES.WEEKLY_SUMMARY:
      subject = '📅 Your Weekly CO2 Emissions Summary';
      body = `
        <h1>Weekly Emissions Summary</h1>
        <p>Hi ${userName},</p>
        <p>Here's your weekly CO2 emissions summary:</p>
        <ul>
          <li>Total emissions this week: <strong>${data.weeklyTotal || 0} kg CO2</strong></li>
          <li>Compared to last week: <strong>${data.weeklyChange || 0}%</strong></li>
          <li>Top emission source: <strong>${data.topSource || 'Not available'}</strong></li>
        </ul>
        <p>Goals progress:</p>
        <ul>
          ${(data.goals || []).map(goal => `
            <li>${goal.description || 'Goal'}: ${goal.progress || 0}% complete</li>
          `).join('')}
        </ul>
        <p><a href="${process.env.APP_URL}/dashboard">View detailed dashboard</a></p>
        <p>The EcoPilot Team</p>
      `;
      break;
      
    default:
      body = `
        <h1>EcoPilot Notification</h1>
        <p>Hi ${userName},</p>
        <p>You have a new notification from EcoPilot. Please check your account for details.</p>
        <p><a href="${process.env.APP_URL}/notifications">View notifications</a></p>
        <p>The EcoPilot Team</p>
      `;
  }
  
  return {
    subject,
    body
  };
}

/**
 * Process notification queue and send pending notifications
 * @returns {Promise<Object>} Processing results
 */
async function processNotificationQueue() {
  try {
    // Get pending notifications
    const records = await notificationsTable.select({
      filterByFormula: `{status} = '${NOTIFICATION_STATUS.PENDING}'`,
      sort: [{ field: 'createdAt', direction: 'asc' }],
      maxRecords: 50 // Process in batches
    }).all();
    
    if (records.length === 0) {
      return { processed: 0, success: 0, failed: 0 };
    }
    
    let success = 0;
    let failed = 0;
    
    // Process each notification
    for (const record of records) {
      try {
        const result = await sendNotificationEmail(record.id);
        if (result) {
          success++;
        } else {
          failed++;
        }
      } catch (error) {
        logger.error('Error processing notification', {
          error: error.message,
          notificationId: record.id
        });
        failed++;
      }
    }
    
    return {
      processed: records.length,
      success,
      failed
    };
  } catch (error) {
    logger.error('Error processing notification queue', {
      error: error.message
    });
    throw new Error(`Failed to process notification queue: ${error.message}`);
  }
}

/**
 * Create goal-related notifications for users
 * This should be run periodically to check for goal progress, deadlines, etc.
 * @returns {Promise<Object>} Processing results
 */
async function createGoalNotifications() {
  try {
    // Get all users
    const users = await base('users').select().all();
    let createdNotifications = 0;
    
    for (const user of users) {
      const userId = user.id;
      
      // Get user's goals
      const goalsTable = base('goals');
      const goals = await goalsTable.select({
        filterByFormula: `{userId} = '${userId}'`
      }).all();
      
      if (goals.length === 0) continue;
      
      // Check for completed goals without notifications
      const completedGoals = goals.filter(goal => 
        goal.fields.status === 'completed' && 
        !goal.fields.notificationSent
      );
      
      for (const goal of completedGoals) {
        // Create completion notification
        await createNotification(
          userId,
          TEMPLATE_TYPES.GOAL_COMPLETED,
          {
            goalId: goal.id,
            goalDescription: goal.fields.description,
            goalType: goal.fields.type,
            target: goal.fields.target
          },
          true // Send email immediately
        );
        
        // Mark notification as sent
        await goalsTable.update(goal.id, {
          notificationSent: true
        });
        
        createdNotifications++;
      }
      
      // Check for approaching deadlines
      const now = new Date();
      const inProgressGoals = goals.filter(goal => 
        goal.fields.status === 'in_progress'
      );
      
      for (const goal of inProgressGoals) {
        const deadline = new Date(goal.fields.deadline);
        const daysRemaining = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
        
        // Notify when 7 days or 3 days remaining
        if ((daysRemaining === 7 || daysRemaining === 3) && !goal.fields.deadlineNotificationSent) {
          await createNotification(
            userId,
            TEMPLATE_TYPES.GOAL_DEADLINE_APPROACHING,
            {
              goalId: goal.id,
              goalDescription: goal.fields.description,
              progress: goal.fields.progress,
              deadline: goal.fields.deadline,
              daysRemaining
            },
            true // Send email immediately
          );
          
          // Mark deadline notification as sent
          await goalsTable.update(goal.id, {
            deadlineNotificationSent: true
          });
          
          createdNotifications++;
        }
        
        // Progress milestone notifications (25%, 50%, 75%)
        const progress = goal.fields.progress || 0;
        const milestones = [25, 50, 75];
        
        // Check if a milestone has been reached but notification not sent
        const progressMilestones = goal.fields.progressMilestones ? 
          JSON.parse(goal.fields.progressMilestones) : [];
        
        for (const milestone of milestones) {
          if (progress >= milestone && !progressMilestones.includes(milestone)) {
            await createNotification(
              userId,
              TEMPLATE_TYPES.GOAL_PROGRESS,
              {
                goalId: goal.id,
                goalDescription: goal.fields.description,
                progress,
                milestone
              },
              true // Send email immediately
            );
            
            // Update progress milestones
            const updatedMilestones = [...progressMilestones, milestone];
            await goalsTable.update(goal.id, {
              progressMilestones: JSON.stringify(updatedMilestones)
            });
            
            createdNotifications++;
          }
        }
      }
    }
    
    return {
      createdNotifications
    };
  } catch (error) {
    logger.error('Error creating goal notifications', {
      error: error.message
    });
    throw new Error(`Failed to create goal notifications: ${error.message}`);
  }
}

module.exports = {
  TEMPLATE_TYPES,
  NOTIFICATION_STATUS,
  createNotification,
  getUserNotifications,
  markNotificationRead,
  sendNotificationEmail,
  processNotificationQueue,
  createGoalNotifications
}; 