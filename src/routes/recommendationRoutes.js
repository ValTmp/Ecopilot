/**
 * Recommendation Routes
 * 
 * API endpoints for personalized CO2 reduction recommendations
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const recommendationService = require('../services/recommendationService');
const co2Calculator = require('../services/co2Calculator');
const logger = require('../services/logger');
const Joi = require('joi');
const { validateRequest } = require('../middleware/validation');

/**
 * @route   GET /recommendations
 * @desc    Get personalized CO2 reduction recommendations
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  
  try {
    // Get user's CO2 calculation history
    const history = await co2Calculator.getUserHistory(userId);
    
    if (!history || history.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Not enough data for recommendations',
        data: {
          recommendations: [],
          hasEnoughData: false
        }
      });
    }
    
    // Generate recommendations based on user's history
    const recommendations = await recommendationService.getRecommendations(userId, history);
    
    logger.co2('Retrieved recommendations', { userId, count: recommendations.length });
    
    return res.status(200).json({
      success: true,
      data: {
        recommendations,
        hasEnoughData: true,
        totalPotentialSavings: recommendations.reduce((sum, rec) => sum + rec.savings, 0)
      }
    });
  } catch (error) {
    logger.error('Error retrieving recommendations', { userId, error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve recommendations',
      error: error.message
    });
  }
});

/**
 * @route   GET /recommendations/categories
 * @desc    Get recommendation categories
 * @access  Public
 */
router.get('/categories', (req, res) => {
  try {
    const categories = recommendationService.getCategories();
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error(`Error fetching recommendation categories: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recommendation categories'
    });
  }
});

// Validation schema for feedback
const feedbackSchema = Joi.object({
  recommendationId: Joi.string().required(),
  isHelpful: Joi.boolean().required()
});

/**
 * @route   POST /recommendations/feedback
 * @desc    Submit feedback on a recommendation
 * @access  Private
 */
router.post('/feedback', 
  authenticateToken,
  validateRequest(feedbackSchema),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { recommendationId, isHelpful } = req.body;
      
      const result = await recommendationService.recordFeedback(
        userId,
        recommendationId,
        isHelpful
      );
      
      res.json({
        success: true,
        message: 'Feedback recorded successfully'
      });
    } catch (error) {
      logger.error(`Error recording recommendation feedback: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to record feedback'
      });
    }
  }
);

module.exports = router; 