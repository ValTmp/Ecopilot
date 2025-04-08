const Airtable = require('airtable');
const redis = require('../config/redis');
const logger = require('./logger');
const co2Calculator = require('./co2Calculator');

// Cache TTL for goals (10 minutes)
const CACHE_TTL = 600;

// Cache key prefix for user goals
const GOAL_CACHE_PREFIX = 'user:goals:';

// Goal types
const GOAL_TYPES = {
  TRANSPORT_REDUCTION: 'transport_reduction',
  OVERALL_REDUCTION: 'overall_reduction',
  CUSTOM: 'custom'
};

// Goal status
const GOAL_STATUS = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

const goalsTable = base('goals');

/**
 * Create a new CO2 reduction goal
 * @param {string} userId - User ID
 * @param {string} type - Goal type from GOAL_TYPES
 * @param {number} target - Target reduction percentage (1-100)
 * @param {string} deadline - ISO string date for the goal deadline
 * @param {string} [description] - Optional description of the goal
 * @param {Object} [customData] - Custom data for specialized goals
 * @returns {Promise<Object>} Created goal
 */
async function createGoal(userId, type, target, deadline, description = '', customData = {}) {
  // Validate inputs
  if (!userId) throw new Error('User ID is required');
  if (!Object.values(GOAL_TYPES).includes(type)) {
    throw new Error(`Invalid goal type. Must be one of: ${Object.values(GOAL_TYPES).join(', ')}`);
  }
  if (!target || target <= 0 || target > 100) {
    throw new Error('Target must be a positive number between 1 and 100');
  }
  if (!deadline || new Date(deadline) <= new Date()) {
    throw new Error('Deadline must be a future date');
  }
  
  try {
    // Calculate baseline metrics
    const baselineMetrics = await calculateBaselineMetrics(userId, type, customData);
    
    // Create goal in Airtable
    const goal = {
      userId,
      type,
      target,
      deadline,
      description: description || `Reduce CO2 by ${target}% by ${new Date(deadline).toLocaleDateString()}`,
      baselineMetrics: JSON.stringify(baselineMetrics),
      customData: customData ? JSON.stringify(customData) : null,
      status: GOAL_STATUS.IN_PROGRESS,
      progress: 0,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    
    const record = await goalsTable.create(goal);
    
    // Invalidate cache
    await redis.del(`${GOAL_CACHE_PREFIX}${userId}`);
    
    // Return created goal
    return {
      id: record.id,
      ...goal,
      baselineMetrics,
      customData: customData || null
    };
  } catch (error) {
    logger.error('Error creating goal', {
      error: error.message,
      userId,
      type
    });
    throw new Error(`Failed to create goal: ${error.message}`);
  }
}

/**
 * Calculate baseline metrics for a user's goal
 * @param {string} userId - User ID
 * @param {string} goalType - Type of goal
 * @param {Object} customData - Custom data for specialized goals
 * @returns {Promise<Object>} Baseline metrics
 */
async function calculateBaselineMetrics(userId, goalType, customData = {}) {
  try {
    // Get the user's CO2 history for the last three months
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const history = await co2Calculator.getUserHistory(userId);
    
    // Filter to last three months
    const recentHistory = history.filter(item => {
      const date = new Date(item.timestamp);
      return date >= threeMonthsAgo && date <= now;
    });
    
    if (recentHistory.length === 0) {
      return {
        averageEmissions: 0,
        totalEmissions: 0,
        emissionsCount: 0,
        transportTypes: {}
      };
    }
    
    // Calculate total and transport-specific metrics
    const transportTypes = {};
    let totalEmissions = 0;
    
    recentHistory.forEach(item => {
      totalEmissions += item.co2Amount;
      
      // Track by transport type
      if (item.transportType) {
        if (!transportTypes[item.transportType]) {
          transportTypes[item.transportType] = {
            count: 0,
            total: 0,
            average: 0
          };
        }
        
        transportTypes[item.transportType].count++;
        transportTypes[item.transportType].total += item.co2Amount;
      }
    });
    
    // Calculate averages
    Object.keys(transportTypes).forEach(type => {
      transportTypes[type].average = 
        transportTypes[type].total / transportTypes[type].count;
    });
    
    return {
      averageEmissions: totalEmissions / recentHistory.length,
      totalEmissions,
      emissionsCount: recentHistory.length,
      transportTypes
    };
  } catch (error) {
    logger.error('Error calculating baseline metrics', {
      error: error.message,
      userId,
      goalType
    });
    return {
      averageEmissions: 0,
      totalEmissions: 0,
      emissionsCount: 0,
      transportTypes: {}
    };
  }
}

/**
 * Get all goals for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} User goals
 */
async function getUserGoals(userId) {
  if (!userId) throw new Error('User ID is required');
  
  try {
    // Check cache first
    const cacheKey = `${GOAL_CACHE_PREFIX}${userId}`;
    const cachedGoals = await redis.get(cacheKey);
    
    if (cachedGoals) {
      logger.info(`Cache hit for user goals: ${userId}`);
      return JSON.parse(cachedGoals);
    }
    
    logger.info(`Cache miss for user goals: ${userId}`);
    
    // Query Airtable
    const records = await goalsTable.select({
      filterByFormula: `{userId} = '${userId}'`,
      sort: [{ field: 'createdAt', direction: 'desc' }]
    }).all();
    
    // Transform records
    const goals = records.map(record => {
      const fields = record.fields;
      let baselineMetrics, customData;
      
      try {
        baselineMetrics = JSON.parse(fields.baselineMetrics || '{}');
      } catch (e) {
        baselineMetrics = {};
      }
      
      try {
        customData = fields.customData ? JSON.parse(fields.customData) : null;
      } catch (e) {
        customData = null;
      }
      
      return {
        id: record.id,
        userId: fields.userId,
        type: fields.type,
        target: parseFloat(fields.target) || 0,
        deadline: fields.deadline,
        description: fields.description,
        baselineMetrics,
        customData,
        status: fields.status,
        progress: parseFloat(fields.progress) || 0,
        createdAt: fields.createdAt,
        lastUpdated: fields.lastUpdated,
        completedAt: fields.completedAt
      };
    });
    
    // Cache the results
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(goals));
    
    return goals;
  } catch (error) {
    logger.error('Error retrieving user goals', {
      error: error.message,
      userId
    });
    throw new Error(`Failed to retrieve user goals: ${error.message}`);
  }
}

/**
 * Update goal progress based on recent calculations
 * This should be run periodically to update all goals
 * @returns {Promise<Object>} Update results
 */
async function updateGoalProgress() {
  try {
    // Get all in-progress goals
    const records = await goalsTable.select({
      filterByFormula: `{status} = '${GOAL_STATUS.IN_PROGRESS}'`
    }).all();
    
    if (records.length === 0) {
      return { updated: 0, completed: 0, failed: 0 };
    }
    
    let updated = 0;
    let completed = 0;
    let failed = 0;
    
    // Process each goal
    for (const record of records) {
      try {
        const goal = record.fields;
        const userId = goal.userId;
        const goalType = goal.type;
        const target = parseFloat(goal.target) || 0;
        let baselineMetrics;
        let customData;
        
        try {
          baselineMetrics = JSON.parse(goal.baselineMetrics || '{}');
        } catch (e) {
          baselineMetrics = {};
        }
        
        try {
          customData = goal.customData ? JSON.parse(goal.customData) : null;
        } catch (e) {
          customData = null;
        }
        
        // Skip if no baseline
        if (!baselineMetrics || !baselineMetrics.averageEmissions) {
          continue;
        }
        
        let progress;
        
        // Calculate progress based on goal type
        if (goalType === GOAL_TYPES.CUSTOM) {
          // For custom goals, we'll need a separate process
          continue;
        } else {
          // Get recent emissions
          const now = new Date();
          const goalCreatedAt = new Date(goal.createdAt);
          
          const history = await co2Calculator.getUserHistory(userId);
          
          // Filter to emissions since goal creation
          const recentHistory = history.filter(item => {
            const date = new Date(item.timestamp);
            return date >= goalCreatedAt && date <= now;
          });
          
          if (recentHistory.length === 0) {
            continue;
          }
          
          let recentEmissions;
          
          if (goalType === GOAL_TYPES.TRANSPORT_REDUCTION) {
            // Filter to specific transport type if specified in customData
            const transportType = customData?.transportType;
            
            if (transportType) {
              const filteredHistory = recentHistory.filter(item => 
                item.transportType === transportType
              );
              
              if (filteredHistory.length === 0) continue;
              
              const totalEmissions = filteredHistory.reduce((sum, item) => 
                sum + item.co2Amount, 0);
                
              recentEmissions = totalEmissions / filteredHistory.length;
            } else {
              // All transport types
              const totalEmissions = recentHistory.reduce((sum, item) => 
                sum + item.co2Amount, 0);
                
              recentEmissions = totalEmissions / recentHistory.length;
            }
          } else {
            // Overall reduction - all emission types
            const totalEmissions = recentHistory.reduce((sum, item) => 
              sum + item.co2Amount, 0);
              
            recentEmissions = totalEmissions / recentHistory.length;
          }
          
          // Calculate reduction percentage
          const baselineAvg = baselineMetrics.averageEmissions;
          const reduction = baselineAvg - recentEmissions;
          const reductionPercent = (reduction / baselineAvg) * 100;
          
          // Calculate progress as percentage of target
          progress = Math.min(100, Math.max(0, 
            (reductionPercent / target) * 100
          ));
        }
        
        // Round progress to 2 decimal places
        progress = Math.round(progress * 100) / 100;
        
        // Determine if goal is completed or failed
        const now = new Date();
        const deadline = new Date(goal.deadline);
        let status = GOAL_STATUS.IN_PROGRESS;
        
        if (progress >= 100) {
          status = GOAL_STATUS.COMPLETED;
          completed++;
        } else if (now > deadline) {
          status = GOAL_STATUS.FAILED;
          failed++;
        }
        
        // Update goal in Airtable
        const updates = {
          progress,
          status,
          lastUpdated: now.toISOString()
        };
        
        if (status === GOAL_STATUS.COMPLETED) {
          updates.completedAt = now.toISOString();
        }
        
        await goalsTable.update(record.id, updates);
        
        // Invalidate cache
        await redis.del(`${GOAL_CACHE_PREFIX}${userId}`);
        
        updated++;
      } catch (error) {
        logger.error('Error updating goal progress', {
          error: error.message,
          goalId: record.id
        });
      }
    }
    
    return {
      updated,
      completed,
      failed
    };
  } catch (error) {
    logger.error('Error updating goal progress', {
      error: error.message
    });
    throw new Error(`Failed to update goal progress: ${error.message}`);
  }
}

/**
 * Get aggregated goal statistics
 * @returns {Promise<Object>} Goal statistics
 */
async function getGoalStats() {
  try {
    // Get all goals
    const records = await goalsTable.select().all();
    
    // Calculate statistics
    const totalGoals = records.length;
    const completedGoals = records.filter(r => r.fields.status === GOAL_STATUS.COMPLETED).length;
    const failedGoals = records.filter(r => r.fields.status === GOAL_STATUS.FAILED).length;
    const inProgressGoals = records.filter(r => r.fields.status === GOAL_STATUS.IN_PROGRESS).length;
    const cancelledGoals = records.filter(r => r.fields.status === GOAL_STATUS.CANCELLED).length;
    
    // Goal types
    const goalsByType = {
      [GOAL_TYPES.TRANSPORT_REDUCTION]: records.filter(r => r.fields.type === GOAL_TYPES.TRANSPORT_REDUCTION).length,
      [GOAL_TYPES.OVERALL_REDUCTION]: records.filter(r => r.fields.type === GOAL_TYPES.OVERALL_REDUCTION).length,
      [GOAL_TYPES.CUSTOM]: records.filter(r => r.fields.type === GOAL_TYPES.CUSTOM).length
    };
    
    // Average target reduction
    const targets = records.map(r => parseFloat(r.fields.target) || 0);
    const avgTarget = targets.length > 0 ? 
      targets.reduce((sum, target) => sum + target, 0) / targets.length : 0;
    
    // Average progress for in-progress goals
    const progresses = records
      .filter(r => r.fields.status === GOAL_STATUS.IN_PROGRESS)
      .map(r => parseFloat(r.fields.progress) || 0);
      
    const avgProgress = progresses.length > 0 ? 
      progresses.reduce((sum, progress) => sum + progress, 0) / progresses.length : 0;
    
    return {
      totalGoals,
      completedGoals,
      failedGoals,
      inProgressGoals,
      cancelledGoals,
      goalsByType,
      avgTarget,
      avgProgress
    };
  } catch (error) {
    logger.error('Error calculating goal statistics', {
      error: error.message
    });
    throw new Error(`Failed to calculate goal statistics: ${error.message}`);
  }
}

/**
 * Update progress for a custom goal
 * @param {string} goalId - Goal ID
 * @param {number} progress - Progress percentage (0-100)
 * @returns {Promise<Object>} Updated goal
 */
async function updateCustomGoalProgress(goalId, progress) {
  if (!goalId) throw new Error('Goal ID is required');
  if (progress < 0 || progress > 100) {
    throw new Error('Progress must be between 0 and 100');
  }
  
  try {
    // Get the goal
    const record = await goalsTable.find(goalId);
    
    if (!record) {
      throw new Error(`Goal with ID ${goalId} not found`);
    }
    
    // Verify it's a custom goal
    if (record.fields.type !== GOAL_TYPES.CUSTOM) {
      throw new Error('Only custom goals can be manually updated');
    }
    
    // Round progress to 2 decimal places
    progress = Math.round(progress * 100) / 100;
    
    // Determine if goal is completed
    const now = new Date();
    let status = record.fields.status;
    
    if (progress >= 100) {
      status = GOAL_STATUS.COMPLETED;
    }
    
    // Update goal in Airtable
    const updates = {
      progress,
      status,
      lastUpdated: now.toISOString()
    };
    
    if (status === GOAL_STATUS.COMPLETED && record.fields.status !== GOAL_STATUS.COMPLETED) {
      updates.completedAt = now.toISOString();
    }
    
    const updatedRecord = await goalsTable.update(goalId, updates);
    
    // Invalidate cache
    await redis.del(`${GOAL_CACHE_PREFIX}${record.fields.userId}`);
    
    // Format response
    let baselineMetrics, customData;
    
    try {
      baselineMetrics = JSON.parse(updatedRecord.fields.baselineMetrics || '{}');
    } catch (e) {
      baselineMetrics = {};
    }
    
    try {
      customData = updatedRecord.fields.customData ? 
        JSON.parse(updatedRecord.fields.customData) : null;
    } catch (e) {
      customData = null;
    }
    
    return {
      id: updatedRecord.id,
      userId: updatedRecord.fields.userId,
      type: updatedRecord.fields.type,
      target: parseFloat(updatedRecord.fields.target) || 0,
      deadline: updatedRecord.fields.deadline,
      description: updatedRecord.fields.description,
      baselineMetrics,
      customData,
      status: updatedRecord.fields.status,
      progress: parseFloat(updatedRecord.fields.progress) || 0,
      createdAt: updatedRecord.fields.createdAt,
      lastUpdated: updatedRecord.fields.lastUpdated,
      completedAt: updatedRecord.fields.completedAt
    };
  } catch (error) {
    logger.error('Error updating custom goal progress', {
      error: error.message,
      goalId
    });
    throw new Error(`Failed to update custom goal progress: ${error.message}`);
  }
}

module.exports = {
  GOAL_TYPES,
  GOAL_STATUS,
  createGoal,
  getUserGoals,
  updateGoalProgress,
  getGoalStats,
  updateCustomGoalProgress
}; 