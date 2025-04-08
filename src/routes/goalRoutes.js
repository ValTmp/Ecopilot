const express = require('express');
const Joi = require('joi');
const router = express.Router();
const goalService = require('../services/goalService');
const notificationService = require('../services/notificationService');
const { validateRequest } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../services/logger');
const rateLimit = require('../middleware/security').rateLimit;

// Schema for creating a goal
const createGoalSchema = Joi.object({
  type: Joi.string().valid(...Object.values(goalService.GOAL_TYPES)).required(),
  target: Joi.number().min(1).max(100).required(),
  deadline: Joi.date().iso().min('now').required(),
  description: Joi.string().max(200).allow(''),
  customData: Joi.object()
    .when('type', {
      is: goalService.GOAL_TYPES.TRANSPORT_REDUCTION,
      then: Joi.object({
        transportType: Joi.string().valid('car', 'plane', 'public')
      })
    })
    .when('type', {
      is: goalService.GOAL_TYPES.CUSTOM,
      then: Joi.object().required()
    })
});

/**
 * @route GET /api/goals
 * @desc Get all goals for the authenticated user
 * @access Private
 */
router.get('/', authenticateToken, rateLimit('goals', 30, 60), async (req, res) => {
  try {
    const userId = req.user.id;
    
    const goals = await goalService.getUserGoals(userId);
    
    return res.status(200).json({
      success: true,
      count: goals.length,
      data: goals
    });
  } catch (error) {
    logger.error('Error retrieving user goals', {
      error: error.message,
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve goals',
      error: error.message
    });
  }
});

/**
 * @route GET /api/goals/:id
 * @desc Get a specific goal by ID
 * @access Private
 */
router.get('/:id', authenticateToken, rateLimit('goals', 30, 60), async (req, res) => {
  try {
    const goalId = req.params.id;
    
    // Get all goals for this user
    const goals = await goalService.getUserGoals(req.user.id);
    
    // Find the specific goal
    const goal = goals.find(g => g.id === goalId);
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: goal
    });
  } catch (error) {
    logger.error('Error retrieving goal', {
      error: error.message,
      goalId: req.params.id,
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve goal',
      error: error.message
    });
  }
});

/**
 * @route POST /api/goals
 * @desc Create a new CO2 reduction goal
 * @access Private
 */
router.post('/', authenticateToken, rateLimit('goals', 10, 60), async (req, res) => {
  try {
    // Validate request body
    const { error, value } = createGoalSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body',
        error: error.details[0].message
      });
    }
    
    const userId = req.user.id;
    const { type, target, deadline, description, customData } = value;
    
    const goal = await goalService.createGoal(
      userId,
      type,
      target,
      description,
      new Date(deadline),
      customData
    );
    
    // Create notification for goal creation
    await notificationService.createNotification(
      userId,
      notificationService.TEMPLATE_TYPES.GOAL_CREATED,
      {
        goalId: goal.id,
        goalDescription: goal.description,
        goalType: goal.type,
        target: goal.target,
        deadline: goal.deadline
      },
      true // Send email immediately
    );
    
    logger.info(`User ${userId} created a new goal`, {
      goalId: goal.id,
      type,
      target
    });
    
    return res.status(201).json({
      success: true,
      message: 'Goal created successfully',
      data: goal
    });
  } catch (error) {
    logger.error('Error creating goal', {
      error: error.message,
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to create goal',
      error: error.message
    });
  }
});

/**
 * @route PUT /api/goals/:id/progress
 * @desc Update progress for a custom goal
 * @access Private
 */
router.put('/:id/progress', authenticateToken, rateLimit('goals', 20, 60), async (req, res) => {
  try {
    const goalId = req.params.id;
    
    // Validate request body
    const schema = Joi.object({
      progress: Joi.number().min(0).max(100).required()
    });
    
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body',
        error: error.details[0].message
      });
    }
    
    // Verify the goal belongs to this user
    const goals = await goalService.getUserGoals(req.user.id);
    const goal = goals.find(g => g.id === goalId);
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found'
      });
    }
    
    // Only custom goals can be manually updated
    if (goal.type !== goalService.GOAL_TYPES.CUSTOM) {
      return res.status(400).json({
        success: false,
        message: 'Only custom goals can be manually updated'
      });
    }
    
    // Update the goal progress
    const updatedGoal = await goalService.updateCustomGoalProgress(
      goalId,
      value.progress
    );
    
    // Check if goal was just completed
    if (
      updatedGoal.status === goalService.GOAL_STATUS.COMPLETED &&
      goal.status !== goalService.GOAL_STATUS.COMPLETED
    ) {
      // Create completion notification
      await notificationService.createNotification(
        req.user.id,
        notificationService.TEMPLATE_TYPES.GOAL_COMPLETED,
        {
          goalId: updatedGoal.id,
          goalDescription: updatedGoal.description,
          goalType: updatedGoal.type,
          target: updatedGoal.target
        },
        true // Send email immediately
      );
    }
    
    return res.status(200).json({
      success: true,
      message: 'Goal progress updated successfully',
      data: updatedGoal
    });
  } catch (error) {
    logger.error('Error updating goal progress', {
      error: error.message,
      goalId: req.params.id,
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to update goal progress',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/goals/:id
 * @desc Cancel a goal
 * @access Private
 */
router.delete('/:id', authenticateToken, rateLimit('goals', 10, 60), async (req, res) => {
  try {
    const goalId = req.params.id;
    
    // Verify the goal belongs to this user
    const goals = await goalService.getUserGoals(req.user.id);
    const goal = goals.find(g => g.id === goalId);
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found'
      });
    }
    
    // Cannot cancel already completed or failed goals
    if (
      goal.status === goalService.GOAL_STATUS.COMPLETED ||
      goal.status === goalService.GOAL_STATUS.FAILED
    ) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a goal with status: ${goal.status}`
      });
    }
    
    // Update goal status to cancelled
    const goalsTable = require('airtable').base(process.env.AIRTABLE_BASE_ID)('goals');
    await goalsTable.update(goalId, {
      status: goalService.GOAL_STATUS.CANCELLED,
      lastUpdated: new Date().toISOString()
    });
    
    // Invalidate cache
    const redis = require('../config/redis');
    await redis.del(`user:goals:${req.user.id}`);
    
    return res.status(200).json({
      success: true,
      message: 'Goal cancelled successfully'
    });
  } catch (error) {
    logger.error('Error cancelling goal', {
      error: error.message,
      goalId: req.params.id,
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel goal',
      error: error.message
    });
  }
});

/**
 * @route GET /api/goals/stats/me
 * @desc Get goal statistics for the authenticated user
 * @access Private
 */
router.get('/stats/me', authenticateToken, rateLimit('goals', 20, 60), async (req, res) => {
  try {
    // Get all goals for the user
    const goals = await goalService.getUserGoals(req.user.id);
    
    // Calculate statistics
    const totalGoals = goals.length;
    const completedGoals = goals.filter(g => g.status === goalService.GOAL_STATUS.COMPLETED).length;
    const inProgressGoals = goals.filter(g => g.status === goalService.GOAL_STATUS.IN_PROGRESS).length;
    const failedGoals = goals.filter(g => g.status === goalService.GOAL_STATUS.FAILED).length;
    const cancelledGoals = goals.filter(g => g.status === goalService.GOAL_STATUS.CANCELLED).length;
    
    // Calculate completion rate
    const completionRate = totalGoals > 0 
      ? Math.round((completedGoals / totalGoals) * 100) 
      : 0;
    
    // Calculate average progress for in-progress goals
    const inProgressAvgProgress = inProgressGoals > 0
      ? goals
          .filter(g => g.status === goalService.GOAL_STATUS.IN_PROGRESS)
          .reduce((sum, g) => sum + g.progress, 0) / inProgressGoals
      : 0;
    
    // Count by type
    const goalsByType = {
      [goalService.GOAL_TYPES.TRANSPORT_REDUCTION]: goals.filter(g => g.type === goalService.GOAL_TYPES.TRANSPORT_REDUCTION).length,
      [goalService.GOAL_TYPES.OVERALL_REDUCTION]: goals.filter(g => g.type === goalService.GOAL_TYPES.OVERALL_REDUCTION).length,
      [goalService.GOAL_TYPES.CUSTOM]: goals.filter(g => g.type === goalService.GOAL_TYPES.CUSTOM).length
    };
    
    return res.status(200).json({
      success: true,
      data: {
        totalGoals,
        completedGoals,
        inProgressGoals,
        failedGoals,
        cancelledGoals,
        completionRate,
        inProgressAvgProgress,
        goalsByType
      }
    });
  } catch (error) {
    logger.error('Error retrieving user goal statistics', {
      error: error.message,
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve goal statistics',
      error: error.message
    });
  }
});

/**
 * @route GET /api/goals/stats/global
 * @desc Get global goal statistics (admin only)
 * @access Private (Admin)
 */
router.get('/stats/global', authenticateToken, async (req, res) => {
  try {
    const stats = await goalService.getGoalStats();
    
    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error retrieving global goal statistics', {
      error: error.message
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve global goal statistics',
      error: error.message
    });
  }
});

/**
 * @route GET /api/goals/types
 * @desc Get all available goal types
 * @access Public
 */
router.get('/types', (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: Object.entries(goalService.GOAL_TYPES).map(([key, value]) => ({
        key,
        value,
        description: getGoalTypeDescription(value)
      }))
    });
  } catch (error) {
    logger.error('Error retrieving goal types', {
      error: error.message
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve goal types',
      error: error.message
    });
  }
});

/**
 * Helper function to get human-readable descriptions for goal types
 * @param {string} type - Goal type
 * @returns {string} Description
 */
function getGoalTypeDescription(type) {
  switch (type) {
    case goalService.GOAL_TYPES.REDUCE_TOTAL:
      return 'Reduce your total CO2 emissions by a percentage';
    case goalService.GOAL_TYPES.REDUCE_CAR:
      return 'Reduce CO2 emissions from car travel by a percentage';
    case goalService.GOAL_TYPES.REDUCE_PLANE:
      return 'Reduce CO2 emissions from plane travel by a percentage';
    case goalService.GOAL_TYPES.INCREASE_PUBLIC:
      return 'Increase your public transport usage';
    case goalService.GOAL_TYPES.CUSTOM:
      return 'Create a custom CO2 reduction goal';
    default:
      return 'Unknown goal type';
  }
}

module.exports = router; 