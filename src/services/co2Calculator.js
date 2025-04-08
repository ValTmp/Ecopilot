const { CO2_CALC } = require('../config/database');
const logger = require('./logger');
const cache = require('../config/redis');

class CO2Calculator {
  /**
   * Calculate CO2 impact for a specific activity
   * @param {String} activity - Activity type
   * @param {Number} value - Activity value
   * @returns {Number} CO2 impact in kg
   */
  static calculateImpact(activity, value) {
    try {
      if (!CO2_CALC[activity]) {
        logger.warn(`Unknown activity type: ${activity}`);
        throw new Error(`Unknown activity: ${activity}`);
      }
      
      return CO2_CALC[activity](value);
    } catch (error) {
      logger.error(`Error calculating CO2 impact: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate total CO2 impact for multiple activities
   * @param {Array} activities - Array of activity objects with type and value
   * @returns {Number} Total CO2 impact in kg
   */
  static getTotalImpact(activities) {
    try {
      return activities.reduce((total, { activity, value }) => {
        return total + this.calculateImpact(activity, value);
      }, 0);
    } catch (error) {
      logger.error(`Error calculating total CO2 impact: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get CO2 impact for a user
   * @param {String} userId - User ID
   * @returns {Promise<Number>} Total CO2 impact in kg
   */
  static async getUserImpact(userId) {
    try {
      // Check cache first
      const cacheKey = `user_impact:${userId}`;
      const cachedImpact = await cache.get(cacheKey);
      
      if (cachedImpact !== null) {
        logger.debug(`Using cached CO2 impact for user ${userId}`);
        return parseFloat(cachedImpact);
      }
      
      // Calculate impact from activities
      const { db, TABLES, FIELDS } = require('../config/database');
      
      const activities = await db.select(TABLES.ACTIVITIES, {
        filterByFormula: `{${FIELDS.ACTIVITIES.USER_ID}} = '${userId}'`
      });
      
      const totalImpact = activities.reduce((total, activity) => {
        return total + (activity[FIELDS.ACTIVITIES.CO2_IMPACT] || 0);
      }, 0);
      
      // Cache the result for 1 hour
      await cache.set(cacheKey, totalImpact.toString(), 3600);
      
      return totalImpact;
    } catch (error) {
      logger.error(`Error getting user CO2 impact: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get CO2 savings for a product
   * @param {String} productId - Product ID
   * @returns {Promise<Number>} CO2 savings in kg
   */
  static async getProductSavings(productId) {
    try {
      // Check cache first
      const cacheKey = `product_savings:${productId}`;
      const cachedSavings = await cache.get(cacheKey);
      
      if (cachedSavings !== null) {
        logger.debug(`Using cached CO2 savings for product ${productId}`);
        return parseFloat(cachedSavings);
      }
      
      // Get product from database
      const { db, TABLES, FIELDS } = require('../config/database');
      
      const products = await db.select(TABLES.PRODUCTS, {
        filterByFormula: `{${FIELDS.PRODUCTS.ID}} = '${productId}'`
      });
      
      if (products.length === 0) {
        throw new Error(`Product not found: ${productId}`);
      }
      
      const savings = products[0][FIELDS.PRODUCTS.CO2_SAVINGS] || 0;
      
      // Cache the result for 1 day
      await cache.set(cacheKey, savings.toString(), 86400);
      
      return savings;
    } catch (error) {
      logger.error(`Error getting product CO2 savings: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Calculate CO2 impact for a user's activities
   * @param {String} userId - User ID
   * @param {Object} activities - User activities
   * @returns {Promise<Object>} Calculation results
   */
  static async calculateUserImpact(userId, activities) {
    try {
      // Calculate impact for each activity
      const results = activities.map(activity => {
        const impact = this.calculateImpact(activity.type, activity.value);
        return {
          ...activity,
          impact
        };
      });
      
      // Calculate total impact
      const totalImpact = results.reduce((total, activity) => total + activity.impact, 0);
      
      // Store activities in database
      const { db, TABLES, FIELDS } = require('../config/database');
      
      const records = results.map(result => ({
        fields: {
          [FIELDS.ACTIVITIES.USER_ID]: userId,
          [FIELDS.ACTIVITIES.TYPE]: result.type,
          [FIELDS.ACTIVITIES.VALUE]: result.value,
          [FIELDS.ACTIVITIES.CO2_IMPACT]: result.impact,
          [FIELDS.ACTIVITIES.DATE]: new Date().toISOString(),
          [FIELDS.ACTIVITIES.DETAILS]: JSON.stringify(result)
        }
      }));
      
      await db.create(TABLES.ACTIVITIES, records);
      
      // Invalidate user impact cache
      await cache.del(`user_impact:${userId}`);
      
      return {
        activities: results,
        totalImpact
      };
    } catch (error) {
      logger.error(`Error calculating user CO2 impact: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get user's CO2 calculation history
   * @param {String} userId - User ID
   * @returns {Promise<Array>} User's activity history
   */
  static async getUserHistory(userId) {
    try {
      // Check cache first
      const cacheKey = `user_history:${userId}`;
      const cachedHistory = await cache.get(cacheKey);
      
      if (cachedHistory !== null) {
        logger.debug(`Using cached history for user ${userId}`);
        return JSON.parse(cachedHistory);
      }
      
      // Get history from database
      const { db, TABLES, FIELDS } = require('../config/database');
      
      const activities = await db.select(TABLES.ACTIVITIES, {
        filterByFormula: `{${FIELDS.ACTIVITIES.USER_ID}} = '${userId}'`,
        sort: [{ field: FIELDS.ACTIVITIES.DATE, direction: 'desc' }]
      });
      
      // Cache the result for 30 minutes
      await cache.set(cacheKey, JSON.stringify(activities), 1800);
      
      return activities;
    } catch (error) {
      logger.error(`Error getting user CO2 history: ${error.message}`);
      throw error;
    }
  }
}

// @KI-GEN-START [2025-04-06]
/**
 * CO2 Calculator for transportation emissions
 * @module services/co2Calculator
 */

/**
 * Transport emission factors (kg CO2 per km)
 * @constant
 * @type {Object}
 */
const EMISSION_FACTORS = {
  car: 0.2,     // 0.2 kg CO2 per km
  plane: 0.3,   // 0.3 kg CO2 per km
  public: 0.05  // 0.05 kg CO2 per km
};

/**
 * Calculate CO2 emissions for a given transport type and distance
 * @param {string} transportType - Type of transportation ("car", "plane", "public")
 * @param {number} distance - Distance traveled in kilometers
 * @returns {number} CO2 emissions in kilograms
 * @throws {Error} If transport type is invalid or distance is not a positive number
 */
function calculateCO2(transportType, distance) {
  // Validate transport type
  if (!EMISSION_FACTORS.hasOwnProperty(transportType)) {
    throw new Error(`Invalid transport type: ${transportType}. Valid types are: ${Object.keys(EMISSION_FACTORS).join(', ')}`);
  }
  
  // Validate distance
  if (typeof distance !== 'number' || isNaN(distance)) {
    throw new Error('Distance must be a number');
  }
  
  if (distance <= 0) {
    throw new Error('Distance must be a positive number');
  }
  
  // Calculate emissions
  const emissionFactor = EMISSION_FACTORS[transportType];
  return emissionFactor * distance;
}

/**
 * Save a CO2 calculation to the database
 * @param {string} userId - User ID
 * @param {string} transportType - Type of transportation ("car", "plane", "public")
 * @param {number} distance - Distance traveled in kilometers
 * @param {number} emissions - CO2 emissions in kilograms
 * @returns {Promise<Object>} Saved calculation record
 * @throws {Error} If saving fails
 */
async function saveCalculation(userId, transportType, distance, emissions) {
  try {
    logger.info(`Saving CO2 calculation for user ${userId}: ${transportType}, ${distance}km, ${emissions}kg`);
    
    const { db, TABLES, FIELDS } = require('../config/database');
    
    // Create record object
    const record = {
      fields: {
        [FIELDS.ACTIVITIES.USER_ID]: userId,
        [FIELDS.ACTIVITIES.TYPE]: `transport_${transportType}`,
        [FIELDS.ACTIVITIES.VALUE]: distance,
        [FIELDS.ACTIVITIES.CO2_IMPACT]: emissions,
        [FIELDS.ACTIVITIES.DATE]: new Date().toISOString(),
        [FIELDS.ACTIVITIES.DETAILS]: JSON.stringify({
          transportType,
          distance,
          emissions,
          calculatedAt: new Date().toISOString()
        })
      }
    };
    
    // Save to Airtable
    const savedRecord = await db.create(TABLES.ACTIVITIES, [record]);
    
    // Invalidate user history cache
    const cacheKey = `user_history:${userId}`;
    await cache.del(cacheKey);
    
    // Invalidate user impact cache
    await cache.del(`user_impact:${userId}`);
    
    logger.debug(`CO2 calculation saved successfully for user ${userId}`);
    
    return savedRecord[0];
  } catch (error) {
    logger.error(`Error saving CO2 calculation: ${error.message}`);
    throw new Error(`Failed to save CO2 calculation: ${error.message}`);
  }
}

/**
 * Get user's CO2 transport calculation history
 * @param {string} userId - User ID
 * @returns {Promise<Array>} User's CO2 transport calculation history
 * @throws {Error} If retrieving history fails
 */
async function getUserHistory(userId) {
  try {
    logger.info(`Retrieving CO2 transport history for user ${userId}`);
    
    // Check cache first
    const cacheKey = `transport_history:${userId}`;
    const cachedHistory = await cache.get(cacheKey);
    
    if (cachedHistory !== null) {
      logger.debug(`Using cached CO2 transport history for user ${userId}`);
      return JSON.parse(cachedHistory);
    }
    
    // Get history from database
    const { db, TABLES, FIELDS } = require('../config/database');
    
    // Filter for transport-related activities only
    const transportActivities = await db.select(TABLES.ACTIVITIES, {
      filterByFormula: `AND({${FIELDS.ACTIVITIES.USER_ID}} = '${userId}', REGEX_MATCH({${FIELDS.ACTIVITIES.TYPE}}, '^transport_'))`
    });
    
    // Transform the data to a more user-friendly format
    const history = transportActivities.map(record => {
      let details = {};
      try {
        details = JSON.parse(record[FIELDS.ACTIVITIES.DETAILS] || '{}');
      } catch (e) {
        logger.warn(`Invalid JSON in activity details: ${e.message}`);
      }
      
      return {
        id: record.id,
        transportType: details.transportType || record[FIELDS.ACTIVITIES.TYPE].replace('transport_', ''),
        distance: record[FIELDS.ACTIVITIES.VALUE] || details.distance || 0,
        emissions: record[FIELDS.ACTIVITIES.CO2_IMPACT] || details.emissions || 0,
        date: record[FIELDS.ACTIVITIES.DATE] || details.calculatedAt || new Date().toISOString(),
        details: details
      };
    });
    
    // Sort by date (newest first)
    history.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Cache the result for 5 minutes (300 seconds)
    await cache.set(cacheKey, JSON.stringify(history), 300);
    
    logger.debug(`Retrieved ${history.length} CO2 transport records for user ${userId}`);
    
    return history;
  } catch (error) {
    logger.error(`Error getting user CO2 transport history: ${error.message}`);
    throw new Error(`Failed to retrieve CO2 transport history: ${error.message}`);
  }
}
// @KI-GEN-END

module.exports = {
  CO2Calculator,
  calculateCO2,
  saveCalculation,
  getUserHistory
}; 