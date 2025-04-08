const cron = require('node-cron');
const logger = require('./logger');
const goalService = require('./goalService');
const notificationService = require('./notificationService');
const co2Calculator = require('./co2Calculator');

/**
 * Initialize all cron jobs
 */
function initCronJobs() {
  logger.info('Initializing cron jobs');
  
  // Update goal progress - every hour
  cron.schedule('0 * * * *', async () => {
    await runWithErrorHandling(
      updateGoalProgress,
      'Goal progress update'
    );
  });
  
  // Send notifications from queue - every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    await runWithErrorHandling(
      processNotificationQueue,
      'Process notification queue'
    );
  });
  
  // Check for goal-related notifications to create - every 12 hours
  cron.schedule('0 */12 * * *', async () => {
    await runWithErrorHandling(
      createGoalNotifications,
      'Create goal notifications'
    );
  });
  
  // Generate weekly summaries - every Monday at 8am
  cron.schedule('0 8 * * 1', async () => {
    await runWithErrorHandling(
      generateWeeklySummaries,
      'Generate weekly summaries'
    );
  });
  
  // Check for emissions increases - every day at 6am
  cron.schedule('0 6 * * *', async () => {
    await runWithErrorHandling(
      checkEmissionsIncreases,
      'Check emissions increases'
    );
  });
  
  logger.info('All cron jobs initialized');
}

/**
 * Run a function with error handling and logging
 * @param {Function} fn - Function to run
 * @param {string} jobName - Name of the job for logging
 */
async function runWithErrorHandling(fn, jobName) {
  try {
    logger.info(`Starting cron job: ${jobName}`);
    const startTime = Date.now();
    
    const result = await fn();
    
    const duration = Date.now() - startTime;
    logger.info(`Completed cron job: ${jobName}`, {
      duration: `${duration}ms`,
      result
    });
    
    return result;
  } catch (error) {
    logger.error(`Error in cron job: ${jobName}`, {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Update progress for all goals
 */
async function updateGoalProgress() {
  return await goalService.updateGoalProgress();
}

/**
 * Process notifications in the queue
 */
async function processNotificationQueue() {
  return await notificationService.processNotificationQueue();
}

/**
 * Create goal-related notifications
 */
async function createGoalNotifications() {
  return await notificationService.createGoalNotifications();
}

/**
 * Generate weekly summaries for all users
 */
async function generateWeeklySummaries() {
  try {
    // Get all users
    const Airtable = require('airtable');
    const base = new Airtable({
      apiKey: process.env.AIRTABLE_API_KEY
    }).base(process.env.AIRTABLE_BASE_ID);
    
    const users = await base('users').select().all();
    let summariesCreated = 0;
    
    // Current week range
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - 7); // One week ago
    
    // Previous week range
    const startOfPrevWeek = new Date(startOfWeek);
    startOfPrevWeek.setDate(startOfWeek.getDate() - 7);
    const endOfPrevWeek = new Date(startOfWeek);
    endOfPrevWeek.setDate(endOfPrevWeek.getDate() - 1);
    
    for (const user of users) {
      const userId = user.id;
      
      // Get user's CO2 history
      const history = await co2Calculator.getUserHistory(userId);
      
      if (history.length === 0) continue;
      
      // Filter to this week's emissions
      const thisWeekEmissions = history.filter(item => {
        const date = new Date(item.timestamp);
        return date >= startOfWeek && date <= today;
      });
      
      if (thisWeekEmissions.length === 0) continue;
      
      // Calculate this week's total
      const weeklyTotal = thisWeekEmissions.reduce((sum, item) => 
        sum + item.co2Amount, 0);
      
      // Calculate previous week's total
      const prevWeekEmissions = history.filter(item => {
        const date = new Date(item.timestamp);
        return date >= startOfPrevWeek && date <= endOfPrevWeek;
      });
      
      let weeklyChange = 0;
      
      if (prevWeekEmissions.length > 0) {
        const prevWeekTotal = prevWeekEmissions.reduce((sum, item) => 
          sum + item.co2Amount, 0);
          
        weeklyChange = prevWeekTotal > 0
          ? Math.round(((weeklyTotal - prevWeekTotal) / prevWeekTotal) * 100)
          : 0;
      }
      
      // Find top emission source
      const emissionsByTransport = {};
      
      thisWeekEmissions.forEach(item => {
        if (!emissionsByTransport[item.transportType]) {
          emissionsByTransport[item.transportType] = 0;
        }
        
        emissionsByTransport[item.transportType] += item.co2Amount;
      });
      
      const topSource = Object.entries(emissionsByTransport)
        .sort((a, b) => b[1] - a[1])
        .map(([key]) => key)[0] || 'Not available';
      
      // Get user's goals and their progress
      const goals = await goalService.getUserGoals(userId);
      const activeGoals = goals.filter(goal => 
        goal.status === goalService.GOAL_STATUS.IN_PROGRESS
      );
      
      // Create weekly summary notification
      await notificationService.createNotification(
        userId,
        notificationService.TEMPLATE_TYPES.WEEKLY_SUMMARY,
        {
          weeklyTotal: Math.round(weeklyTotal * 100) / 100,
          weeklyChange,
          topSource,
          goals: activeGoals.map(goal => ({
            description: goal.description,
            progress: goal.progress
          }))
        },
        true // Send email immediately
      );
      
      summariesCreated++;
    }
    
    return { summariesCreated };
  } catch (error) {
    logger.error('Error generating weekly summaries', {
      error: error.message
    });
    throw new Error(`Failed to generate weekly summaries: ${error.message}`);
  }
}

/**
 * Check for significant increases in emissions
 */
async function checkEmissionsIncreases() {
  try {
    // Get all users
    const Airtable = require('airtable');
    const base = new Airtable({
      apiKey: process.env.AIRTABLE_API_KEY
    }).base(process.env.AIRTABLE_BASE_ID);
    
    const users = await base('users').select().all();
    let increasesDetected = 0;
    
    // Threshold for significant increase (percentage)
    const INCREASE_THRESHOLD = 20;
    
    // Time periods
    const today = new Date();
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(today.getDate() - 7);
    
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(today.getDate() - 14);
    
    for (const user of users) {
      const userId = user.id;
      
      // Get user's CO2 history
      const history = await co2Calculator.getUserHistory(userId);
      
      if (history.length < 3) continue; // Not enough data
      
      // Get recent emissions (last week)
      const recentEmissions = history.filter(item => {
        const date = new Date(item.timestamp);
        return date >= oneWeekAgo && date <= today;
      });
      
      if (recentEmissions.length === 0) continue;
      
      // Calculate average recent emissions
      const recentTotal = recentEmissions.reduce((sum, item) => 
        sum + item.co2Amount, 0);
      const recentAvg = recentTotal / recentEmissions.length;
      
      // Get previous period emissions (week before)
      const previousEmissions = history.filter(item => {
        const date = new Date(item.timestamp);
        return date >= twoWeeksAgo && date < oneWeekAgo;
      });
      
      if (previousEmissions.length === 0) continue;
      
      // Calculate previous average
      const previousTotal = previousEmissions.reduce((sum, item) => 
        sum + item.co2Amount, 0);
      const previousAvg = previousTotal / previousEmissions.length;
      
      // Check for significant increase
      if (previousAvg > 0 && recentAvg > previousAvg) {
        const increasePercentage = ((recentAvg - previousAvg) / previousAvg) * 100;
        
        if (increasePercentage >= INCREASE_THRESHOLD) {
          // Create notification for emissions increase
          await notificationService.createNotification(
            userId,
            notificationService.TEMPLATE_TYPES.EMISSIONS_INCREASE,
            {
              recentEmissions: Math.round(recentAvg * 100) / 100,
              previousAverage: Math.round(previousAvg * 100) / 100,
              increasePercentage: Math.round(increasePercentage * 10) / 10
            },
            true // Send email immediately
          );
          
          increasesDetected++;
        }
      }
    }
    
    return { increasesDetected };
  } catch (error) {
    logger.error('Error checking emissions increases', {
      error: error.message
    });
    throw new Error(`Failed to check emissions increases: ${error.message}`);
  }
}

module.exports = {
  initCronJobs,
  updateGoalProgress,
  processNotificationQueue,
  createGoalNotifications,
  generateWeeklySummaries,
  checkEmissionsIncreases
}; 