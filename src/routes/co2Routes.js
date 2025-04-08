// @KI-GEN-START [2025-04-06]
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { validateJoi, schemas } = require('../middleware/validation');
const { co2CalculatorLimiter } = require('../middleware/security');
const co2Calculator = require('../services/co2Calculator');
const ecoTipsService = require('../services/ecoTipsService');
const logger = require('../services/logger');
const redis = require('../config/redis');
const monitoring = require('../services/monitoring');

const router = express.Router();

// Apply monitoring middleware to track all API usage
router.use(monitoring.trackApiUsage);

/**
 * Middleware to add cache metadata to responses
 * @param {boolean} fromCache - Whether data is from cache or not
 */
const addCacheHeaders = (req, res, next) => {
  // Wrap original send method to add cache headers just before sending
  const originalSend = res.send;
  
  res.send = function(body) {
    // Set cache headers
    if (res.fromCache) {
      res.setHeader('X-Cache', 'HIT');
      
      // Allow browser to cache (with revalidation) if it's a GET request
      if (req.method === 'GET') {
        res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
      }
    } else {
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('Cache-Control', 'no-store');
    }
    
    // Call the original send method
    return originalSend.call(this, body);
  };
  
  next();
};

// Apply cache header middleware to all routes
router.use(addCacheHeaders);

/**
 * @route POST /api/co2/calculate
 * @desc Calculate CO2 emissions for a given transport type and distance
 * @access Private
 */
router.post('/calculate', authenticate, async (req, res) => {
  try {
    const { transport_type, distance } = req.body;
    const user_id = req.user?.id;

    // Validierung
    if (!user_id) {
      return res.status(401).json({ error: 'User ID is required' });
    }
    
    if (!transport_type || !['car', 'plane', 'public'].includes(transport_type)) {
      return res.status(400).json({ error: 'Valid transport_type is required (car, plane, or public)' });
    }
    
    if (!distance || isNaN(distance) || distance <= 0) {
      return res.status(400).json({ error: 'Valid distance greater than 0 is required' });
    }

    // CO2-Berechnung mit der neuen Hilfsfunktion
    const co2_impact = co2Calculator.calculateCO2(transport_type, distance);
    
    // Speichern der Berechnung
    const savedCalculation = await co2Calculator.saveCalculation(user_id, transport_type, distance, co2_impact);
    
    // Invalidate related caches
    try {
      // Get all keys related to this user's history
      const historyKeys = await redis.keys(`user_history:${user_id}*`);
      if (historyKeys.length > 0) {
        await redis.del(historyKeys);
        logger.debug(`Invalidated ${historyKeys.length} cache keys for user ${user_id}`);
      }
    } catch (cacheError) {
      logger.error(`Error invalidating cache: ${cacheError.message}`);
      // Continue anyway - non-critical operation
    }
    
    res.json({ 
      success: true, 
      calculation: savedCalculation 
    });
  } catch (error) {
    console.error('Error in CO2 calculation:', error);
    res.status(500).json({ error: 'Failed to calculate CO2 impact' });
  }
});

/**
 * @route GET /api/co2/factors
 * @desc Get emission factors for different transport types
 * @access Public
 */
router.get('/factors', co2CalculatorLimiter, async (req, res) => {
  try {
    // Use the improved getEmissionFactors function that handles caching internally
    const factors = await co2Calculator.getEmissionFactors();
    
    // Set fromCache flag based on the return value
    res.fromCache = factors._fromCache === true;
    
    // Remove metadata before sending
    if (factors._fromCache !== undefined) {
      delete factors._fromCache;
    }
    
    res.json({
      success: true,
      data: factors
    });
  } catch (error) {
    logger.error('Failed to retrieve emission factors', { error: error.message, stack: error.stack });
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve emission factors'
    });
  }
});

/**
 * @route GET /api/co2/history/:userId
 * @desc Get a user's CO2 calculation history
 * @access Private
 */
router.get('/history/:userId',
  authenticate,
  async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Check if user object exists (authentication successful)
      if (!req.user) {
        return res.status(401).json({ 
          success: false,
          error: 'Authentication failed'
        });
      }
      
      // Check if user is requesting their own history or if they're an admin
      if (req.user.id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false,
          error: 'You are not authorized to view this user\'s history' 
        });
      }
      
      const history = await co2Calculator.getUserHistory(userId);
      
      // Set fromCache flag if history has metadata
      if (history._fromCache !== undefined) {
        res.fromCache = history._fromCache;
        delete history._fromCache;
      }
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Failed to fetch CO2 history', { error: error.message, stack: error.stack, userId: req.params.userId });
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch CO2 history' 
      });
    }
  }
);

/**
 * @route POST /api/co2/estimate
 * @desc Estimate CO2 emissions without saving
 * @access Public
 */
router.post('/estimate', async (req, res) => {
  try {
    const { transportType, distance } = req.body;
    
    if (!transportType || !distance) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const calculation = await co2Calculator.calculateEmissions(transportType, distance);
    
    res.json(calculation);
  } catch (error) {
    console.error('Error estimating CO2 emissions:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * @route GET /api/co2/tips
 * @desc Get personalized eco tips based on transport type and distance
 * @access Private
 */
router.get('/tips',
  co2CalculatorLimiter,
  authenticate,
  async (req, res) => {
    try {
      const { userId, transportType, distance } = req.query;
      
      if (!userId || !transportType) {
        return res.status(400).json({
          success: false,
          error: 'User ID and transport type are required'
        });
      }
      
      // Convert distance to number if provided
      const distanceValue = distance ? parseFloat(distance) : 0;
      
      // Get personalized tips
      const tips = await ecoTipsService.getPersonalizedTips(userId, transportType, distanceValue);
      
      // Set cache headers
      if (res.fromCache) {
        res.setHeader('X-Cache', 'HIT');
      } else {
        res.setHeader('X-Cache', 'MISS');
      }
      
      res.json({
        success: true,
        data: tips
      });
    } catch (error) {
      logger.error('Failed to retrieve eco tips', { 
        error: error.message,
        stack: error.stack,
        query: req.query
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve eco tips'
      });
    }
  }
);

/**
 * @route GET /api/co2/tip-categories
 * @desc Get all available tip categories
 * @access Public
 */
router.get('/tip-categories', async (req, res) => {
  try {
    const categories = ecoTipsService.getTipCategories();
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Failed to retrieve tip categories', { 
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve tip categories'
    });
  }
});

/**
 * @route GET /api/co2/favorite-tips/:userId
 * @desc Get user's favorite eco tips
 * @access Private
 */
router.get('/favorite-tips/:userId',
  authenticate,
  async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Check if user is requesting their own data or if they're an admin
      if (req.user.id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false,
          error: 'You are not authorized to access this user\'s favorite tips' 
        });
      }
      
      const favoriteTips = await ecoTipsService.getFavoriteTips(userId);
      
      res.json({
        success: true,
        data: favoriteTips
      });
    } catch (error) {
      logger.error('Failed to retrieve favorite tips', { 
        error: error.message,
        stack: error.stack,
        userId: req.params.userId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve favorite tips'
      });
    }
  }
);

/**
 * @route POST /api/co2/favorite-tips/:userId
 * @desc Add a tip to user's favorites
 * @access Private
 */
router.post('/favorite-tips/:userId',
  authenticate,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { tipId } = req.body;
      
      if (!tipId) {
        return res.status(400).json({
          success: false,
          error: 'Tip ID is required'
        });
      }
      
      // Check if user is requesting their own data or if they're an admin
      if (req.user.id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false,
          error: 'You are not authorized to modify this user\'s favorite tips' 
        });
      }
      
      const success = await ecoTipsService.saveTipToFavorites(userId, tipId);
      
      if (success) {
        res.json({
          success: true,
          message: 'Tip added to favorites'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to add tip to favorites'
        });
      }
    } catch (error) {
      logger.error('Failed to add tip to favorites', { 
        error: error.message,
        stack: error.stack,
        userId: req.params.userId,
        tipId: req.body.tipId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to add tip to favorites'
      });
    }
  }
);

/**
 * @route DELETE /api/co2/favorite-tips/:userId/:tipId
 * @desc Remove a tip from user's favorites
 * @access Private
 */
router.delete('/favorite-tips/:userId/:tipId',
  authenticate,
  async (req, res) => {
    try {
      const { userId, tipId } = req.params;
      
      // Check if user is requesting their own data or if they're an admin
      if (req.user.id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false,
          error: 'You are not authorized to modify this user\'s favorite tips' 
        });
      }
      
      const success = await ecoTipsService.removeTipFromFavorites(userId, tipId);
      
      if (success) {
        res.json({
          success: true,
          message: 'Tip removed from favorites'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to remove tip from favorites'
        });
      }
    } catch (error) {
      logger.error('Failed to remove tip from favorites', { 
        error: error.message,
        stack: error.stack,
        userId: req.params.userId,
        tipId: req.params.tipId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to remove tip from favorites'
      });
    }
  }
);

/**
 * @route GET /api/co2/export/:userId
 * @desc Export a user's CO2 calculation history as CSV or JSON
 * @access Private
 */
router.get('/export/:userId',
  authenticate,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { format = 'json' } = req.query;
      
      // Check if user object exists (authentication successful)
      if (!req.user) {
        return res.status(401).json({ 
          success: false,
          error: 'Authentication failed'
        });
      }
      
      // Check if user is requesting their own data or if they're an admin
      if (req.user.id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false,
          error: 'You are not authorized to export this user\'s data' 
        });
      }
      
      // Get user history
      const history = await co2Calculator.getUserHistory(userId);
      
      // Format depends on the query parameter
      if (format.toLowerCase() === 'csv') {
        // Set CSV headers
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="co2_history_${userId}.csv"`);
        
        // Create CSV header
        let csv = 'ID,Date,Transport Type,Distance,CO2 Impact\n';
        
        // Add data rows with error handling for date formatting
        history.forEach(item => {
          try {
            const date = new Date(item.date).toISOString();
            csv += `${item.id},${date},${item.transportType},${item.distance},${item.co2Impact}\n`;
          } catch (error) {
            logger.warn(`Invalid date format for item ${item.id}`, { itemDate: item.date });
            // Fallback to original string or 'unknown'
            csv += `${item.id},${item.date || 'unknown'},${item.transportType},${item.distance},${item.co2Impact}\n`;
          }
        });
        
        return res.send(csv);
      } else {
        // Default to JSON
        return res.json({
          success: true,
          data: history
        });
      }
    } catch (error) {
      logger.error('Failed to export CO2 history', { 
        error: error.message, 
        stack: error.stack, 
        userId: req.params.userId
      });
      
      res.status(500).json({ 
        success: false,
        error: 'Failed to export CO2 history' 
      });
    }
  }
);

module.exports = router;
// @KI-GEN-END 