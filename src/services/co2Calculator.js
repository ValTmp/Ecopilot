const { CO2_CALC } = require('../config/database');
const logger = require('./logger');
const cache = require('../config/redis');
const Airtable = require('airtable');
const Redis = require('ioredis');
const monitoring = require('./monitoring');
const { v4: uuidv4 } = require('uuid');
const { performance } = require('perf_hooks');

const redis = new Redis(process.env.REDIS_URL);
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

// Constants
const EMISSION_FACTORS_CACHE_KEY = 'co2:emission_factors';
const USER_HISTORY_CACHE_KEY = 'user_history:';
const CACHE_TTL = 60 * 60; // 1 hour in seconds

// Default emission factors (used as fallback)
const DEFAULT_EMISSION_FACTORS = {
  car: 0.171,
  plane: 0.255,
  public: 0.04
};

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
   * Get a user's CO2 calculation history
   * @param {String} userId - User ID
   * @returns {Promise<Array>} User's CO2 calculation history
   */
  static async getUserHistory(userId) {
    try {
      // Validate input
      if (!userId) {
        throw new Error('userId is required');
      }
      
      // Check cache first
      const cacheKey = `user_history:${userId}`;
      const cachedHistory = await cache.get(cacheKey);
      
      if (cachedHistory !== null) {
        logger.debug(`Using cached CO2 history for user ${userId}`);
        return JSON.parse(cachedHistory);
      }
      
      // Get history from Airtable
      const { db, TABLES, FIELDS } = require('../config/database');
      
      const activities = await db.select(TABLES.ACTIVITIES, {
        filterByFormula: `{${FIELDS.ACTIVITIES.USER_ID}} = '${userId}' AND {${FIELDS.ACTIVITIES.TYPE}} LIKE 'transport_%'`,
        sort: [{ field: FIELDS.ACTIVITIES.DATE, direction: 'desc' }]
      });
      
      // Format the history
      const history = activities.map(activity => ({
        id: activity.id,
        type: activity[FIELDS.ACTIVITIES.TYPE],
        description: activity[FIELDS.ACTIVITIES.DESCRIPTION] || `${activity[FIELDS.ACTIVITIES.TYPE].replace('transport_', '')} travel: ${activity[FIELDS.ACTIVITIES.VALUE]} km`,
        co2Impact: activity[FIELDS.ACTIVITIES.CO2_IMPACT],
        date: activity[FIELDS.ACTIVITIES.DATE],
        createdAt: activity.createdTime
      }));
      
      // Cache the result for 5 minutes (300 seconds)
      await cache.set(cacheKey, JSON.stringify(history), 300);
      
      // Log the history retrieval
      logger.co2('CO2 History Retrieved', {
        userId,
        recordCount: history.length,
        fromCache: false
      });
      
      return history;
    } catch (error) {
      logger.error(`Error getting user CO2 history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save a CO2 calculation to the database
   * @param {String} userId - User ID
   * @param {String} transportType - Type of transportation
   * @param {Number} distance - Distance in kilometers
   * @param {Number} emissions - CO2 emissions in kg
   * @returns {Promise<Object>} Saved calculation record
   */
  static async saveCalculation(userId, transportType, distance, emissions) {
    try {
      // Validate inputs
      if (!userId) {
        throw new Error('userId is required');
      }
      
      if (!['car', 'plane', 'public'].includes(transportType)) {
        throw new Error(`Invalid transport type: ${transportType}. Valid types are: car, plane, public`);
      }
      
      if (typeof distance !== 'number' || isNaN(distance) || distance <= 0) {
        throw new Error('Distance must be a positive number');
      }
      
      if (typeof emissions !== 'number' || isNaN(emissions) || emissions < 0) {
        throw new Error('Emissions must be a non-negative number');
      }
      
      // Create record in Airtable
      const { db, TABLES, FIELDS } = require('../config/database');
      
      const record = {
        fields: {
          [FIELDS.ACTIVITIES.USER_ID]: userId,
          [FIELDS.ACTIVITIES.TYPE]: `transport_${transportType}`,
          [FIELDS.ACTIVITIES.VALUE]: distance,
          [FIELDS.ACTIVITIES.CO2_IMPACT]: emissions,
          [FIELDS.ACTIVITIES.DATE]: new Date().toISOString(),
          [FIELDS.ACTIVITIES.DESCRIPTION]: `${transportType.charAt(0).toUpperCase() + transportType.slice(1)} travel: ${distance} km`
        }
      };
      
      const savedRecord = await db.create(TABLES.ACTIVITIES, record);
      
      // Invalidate relevant caches
      await cache.del(`user_impact:${userId}`);
      await cache.del(`user_history:${userId}`);
      
      // Log the calculation
      logger.co2('CO2 Calculation Saved', {
        userId,
        transportType,
        distance,
        emissions,
        recordId: savedRecord.id
      });
      
      return {
        id: savedRecord.id,
        userId,
        transportType,
        distance,
        emissions,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Error saving CO2 calculation: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Calculate CO2 emissions based on transport type and distance
 * @param {string} transportType - Type of transport (car, plane, public)
 * @param {number} distance - Distance in kilometers
 * @returns {number} - CO2 emissions in kg
 */
function calculateCO2(transportType, distance) {
  // Default emission factors for different transport types (kg CO2 per km)
  const factor = DEFAULT_EMISSION_FACTORS[transportType];
  
  if (!factor) {
    throw new Error(`Invalid transport type: ${transportType}`);
  }
  
  return factor * distance;
}

/**
 * Save a CO2 calculation to the database and update cache
 * @param {string} userId - User ID
 * @param {string} transportType - Transport type (car, plane, public)
 * @param {number} distance - Distance traveled
 * @returns {Promise<Object>} - Saved calculation
 */
async function saveCalculation(userId, transportType, distance) {
  try {
    // Validate inputs
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    if (!transportType || !['car', 'plane', 'public'].includes(transportType)) {
      throw new Error('Invalid transport type. Must be car, plane, or public');
    }
    
    if (typeof distance !== 'number' || isNaN(distance) || distance <= 0) {
      throw new Error('Distance must be a positive number');
    }
    
    // Generate a unique ID for the calculation
    const calculationId = uuidv4();
    
    // Calculate CO2 impact
    const co2Impact = calculateCO2(transportType, distance);
    
    // Create the calculation object
    const calculation = {
      id: calculationId,
      userId,
      transportType,
      distance,
      co2Impact,
      date: new Date().toISOString()
    };
    
    // Log calculation details for debugging and monitoring
    logger.debug('Creating new CO2 calculation', {
      calculationId,
      userId,
      transportType,
      distance,
      co2Impact
    });
    
    // Performance tracking
    const start = performance.now();
    
    // Save to Airtable
    try {
      await base('co2_calculations').create({
        user_id: userId,
        transport_type: transportType,
        distance,
        co2_impact: co2Impact,
        date: calculation.date
      });
    } catch (airtableError) {
      logger.error(`Airtable error saving calculation: ${airtableError.message}`, { 
        error: airtableError.stack,
        calculationId,
        userId
      });
      await monitoring.trackError('co2Calculator', 'AirtableSaveError', airtableError.message);
      throw new Error(`Failed to save calculation to database: ${airtableError.message}`);
    }
    
    // Update cache asynchronously - don't await to improve response time
    updateUserHistoryCache(userId, calculation)
      .catch(error => {
        logger.error(`Error in async cache update: ${error.message}`, { error: error.stack });
      });
    
    // Track performance
    const end = performance.now();
    await monitoring.trackResponseTime('saveCalculation', end - start, false);
    
    return calculation;
  } catch (error) {
    logger.error(`Error saving CO2 calculation: ${error.message}`, { error: error.stack });
    await monitoring.trackError('co2Calculator', 'SaveCalculationError', error.message);
    throw error;
  }
}

/**
 * Get emission factors for different transport types
 * @returns {Promise<Object>} - Emission factors
 */
async function getEmissionFactors() {
  const start = performance.now();
  let fromCache = false;
  let cacheError = false;
  
  try {
    // Try to get from cache first
    let cachedFactors;
    
    try {
      // Add timeout to Redis get operation to prevent blocking
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Redis operation timeout')), 500); // 500ms timeout
      });
      
      cachedFactors = await Promise.race([
        redis.get(EMISSION_FACTORS_CACHE_KEY),
        timeoutPromise
      ]);
    } catch (redisError) {
      // Redis connection error or timeout - log and continue without cache
      logger.error(`Redis error retrieving emission factors: ${redisError.message}`, { 
        error: redisError.stack,
        operation: 'getEmissionFactors',
        cacheKey: EMISSION_FACTORS_CACHE_KEY
      });
      await monitoring.trackError('co2Calculator', 'RedisConnectionError', redisError.message);
      cacheError = true;
      // Continue without cache
    }
    
    if (cachedFactors) {
      // Track cache hit
      await monitoring.trackCacheHit('co2:emission_factors');
      fromCache = true;
      
      try {
        const parsedFactors = JSON.parse(cachedFactors);
        logger.debug('Retrieved emission factors from cache');
        
        // Validate factor data structure
        if (!parsedFactors.car || !parsedFactors.plane || !parsedFactors.public) {
          throw new Error('Invalid emission factor data structure in cache');
        }
        
        const end = performance.now();
        await monitoring.trackResponseTime('getEmissionFactors', end - start, true);
        
        // Add metadata about cache source
        parsedFactors._fromCache = true;
        
        return parsedFactors;
      } catch (parseError) {
        logger.error(`Error parsing cached emission factors: ${parseError.message}`, {
          error: parseError.stack,
          cachedData: typeof cachedFactors === 'string' ? cachedFactors.substring(0, 100) : typeof cachedFactors
        });
        await monitoring.trackError('co2Calculator', 'CacheParseError', parseError.message);
        // Continue to fetch from Airtable if parsing fails
      }
    }
    
    // Track cache miss
    await monitoring.trackCacheMiss('co2:emission_factors');
    
    // Track time spent after cache miss
    const afterCacheTime = performance.now();
    
    // Fetch from Airtable
    let records;
    try {
      records = await base('emission_factors').select().all();
    } catch (airtableError) {
      logger.error(`Airtable error fetching emission factors: ${airtableError.message}`, { error: airtableError.stack });
      await monitoring.trackError('co2Calculator', 'AirtableError', airtableError.message);
      
      // Return default factors if Airtable fetch fails
      const defaultFactors = {
        car: 0.171,
        plane: 0.255,
        public: 0.04,
        _fromCache: false
      };
      
      logger.warn('Using default emission factors due to Airtable error');
      
      // If cache had an error too, track as critical incident
      if (cacheError) {
        await monitoring.trackError('co2Calculator', 'CriticalDataFetchError', 
          'Both cache and database failed for emission factors');
      }
      
      // Also attempt to repair cache with default values if there was a cache error
      if (cacheError) {
        try {
          // Don't store the _fromCache flag in Redis
          const factorsToCache = { ...defaultFactors };
          delete factorsToCache._fromCache;
          
          await redis.set(EMISSION_FACTORS_CACHE_KEY, JSON.stringify(factorsToCache), CACHE_TTL);
          logger.info('Cache repaired with default emission factors');
        } catch (repairError) {
          logger.error(`Failed to repair cache: ${repairError.message}`);
        }
      }
      
      return defaultFactors;
    }
    
    // Track database fetch time
    const dbFetchTime = performance.now() - afterCacheTime;
    await monitoring.trackResponseTime('getEmissionFactors:dbFetch', dbFetchTime, false);
    
    const factors = {};
    records.forEach(record => {
      factors[record.get('transport_type')] = record.get('factor');
    });
    
    // Validate that we have all required factors
    const requiredTypes = ['car', 'plane', 'public'];
    let missingTypes = requiredTypes.filter(type => !factors[type]);
    
    if (missingTypes.length > 0) {
      logger.warn(`Missing emission factors for: ${missingTypes.join(', ')}`);
      
      // Add default values for missing types
      missingTypes.forEach(type => {
        factors[type] = DEFAULT_EMISSION_FACTORS[type];
      });
    }
    
    // Add metadata about cache source 
    factors._fromCache = false;
    
    // Store in cache using pipeline (without the metadata)
    const cacheStartTime = performance.now();
    try {
      const factorsToCache = { ...factors };
      delete factorsToCache._fromCache;
      
      const pipeline = redis.pipeline();
      pipeline.set(EMISSION_FACTORS_CACHE_KEY, JSON.stringify(factorsToCache));
      pipeline.expire(EMISSION_FACTORS_CACHE_KEY, CACHE_TTL);
      await pipeline.exec();
      
      // Track cache set time
      const cacheSetTime = performance.now() - cacheStartTime;
      await monitoring.trackResponseTime('getEmissionFactors:cacheSet', cacheSetTime, false);
      
      logger.debug('Fetched and cached emission factors');
    } catch (redisError) {
      logger.error(`Redis error caching emission factors: ${redisError.message}`, { error: redisError.stack });
      await monitoring.trackError('co2Calculator', 'RedisCacheError', redisError.message);
      // Continue without caching
    }
    
    const end = performance.now();
    await monitoring.trackResponseTime('getEmissionFactors', end - start, false);
    
    return factors;
  } catch (error) {
    logger.error(`Error getting emission factors: ${error.message}`, { error: error.stack });
    await monitoring.trackError('co2Calculator', 'EmissionFactorsError', error.message);
    
    // Return default factors as fallback
    return {
      car: 0.171,
      plane: 0.255,
      public: 0.04,
      _fromCache: false
    };
  }
}

/**
 * Get a user's CO2 calculation history
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - User's calculation history
 */
async function getUserHistory(userId) {
  const start = performance.now();
  let fromCache = false;
  
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const cacheKey = `${USER_HISTORY_CACHE_KEY}${userId}`;
    
    // Try to get from cache first
    let cachedHistory;
    
    try {
      // Add timeout to Redis get operation
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Redis operation timeout')), 500); // 500ms timeout
      });
      
      cachedHistory = await Promise.race([
        redis.get(cacheKey),
        timeoutPromise
      ]);
    } catch (redisError) {
      // Redis connection error - log and continue without cache
      logger.error(`Redis error retrieving user history: ${redisError.message}`, { error: redisError.stack });
      await monitoring.trackError('co2Calculator', 'RedisConnectionError', redisError.message);
      // Continue without cache
    }
    
    if (cachedHistory) {
      // Track cache hit
      await monitoring.trackCacheHit('user_history');
      fromCache = true;
      
      try {
        const parsedHistory = JSON.parse(cachedHistory);
        logger.debug(`Retrieved user history from cache for user ${userId}`);
        
        const end = performance.now();
        await monitoring.trackResponseTime('getUserHistory', end - start, true);
        
        // Add cache metadata
        parsedHistory._fromCache = true;
        
        return parsedHistory;
      } catch (parseError) {
        logger.error(`Error parsing cached history: ${parseError.message}`, { error: parseError.stack });
        await monitoring.trackError('co2Calculator', 'CacheParseError', parseError.message);
        // Continue to fetch from Airtable if parsing fails
      }
    }
    
    // Track cache miss
    await monitoring.trackCacheMiss('user_history');
    
    // Fetch from Airtable
    let records;
    try {
      records = await base('co2_calculations')
        .select({
          filterByFormula: `{user_id} = '${userId}'`,
          sort: [{ field: 'date', direction: 'desc' }]
        })
        .all();
    } catch (airtableError) {
      logger.error(`Airtable error fetching user history: ${airtableError.message}`, { error: airtableError.stack });
      await monitoring.trackError('co2Calculator', 'AirtableError', airtableError.message);
      
      // Return empty array if Airtable fetch fails
      logger.warn(`Returning empty history for user ${userId} due to database error`);
      return { _fromCache: false, data: [] };
    }
    
    const history = records.map(record => ({
      id: record.getId(),
      userId: record.get('user_id'),
      transportType: record.get('transport_type'),
      distance: record.get('distance'),
      co2Impact: record.get('co2_impact'),
      date: record.get('date')
    }));
    
    // Add metadata about cache source
    history._fromCache = false;
    
    // Store in cache using pipeline (without metadata)
    try {
      const historyToCache = [...history];
      const pipeline = redis.pipeline();
      pipeline.set(cacheKey, JSON.stringify(historyToCache));
      pipeline.expire(cacheKey, CACHE_TTL);
      await pipeline.exec();
      
      logger.debug(`Fetched and cached user history for user ${userId}`);
    } catch (redisError) {
      logger.error(`Redis error caching user history: ${redisError.message}`, { error: redisError.stack });
      await monitoring.trackError('co2Calculator', 'RedisCacheError', redisError.message);
      // Continue without caching
    }
    
    const end = performance.now();
    await monitoring.trackResponseTime('getUserHistory', end - start, false);
    
    return history;
  } catch (error) {
    logger.error(`Error getting user history: ${error.message}`, { error: error.stack });
    await monitoring.trackError('co2Calculator', 'GetHistoryError', error.message);
    
    // Return empty array as fallback
    return { _fromCache: false, data: [] };
  }
}

/**
 * Helper function to update user history cache after a new calculation
 * @param {string} userId - User ID
 * @param {Object} calculation - The new calculation to add
 */
async function updateUserHistoryCache(userId, calculation) {
  try {
    if (!userId || !calculation) {
      logger.warn('Missing userId or calculation in updateUserHistoryCache');
      return;
    }
    
    const cacheKey = `${USER_HISTORY_CACHE_KEY}${userId}`;
    
    // Multiple Redis operations in a pipeline
    const pipeline = redis.pipeline();
    
    // Get existing history from cache
    let history = [];
    try {
      const cachedHistory = await redis.get(cacheKey);
      
      if (cachedHistory) {
        try {
          history = JSON.parse(cachedHistory);
        } catch (parseError) {
          logger.error(`Error parsing cached history: ${parseError.message}`, { error: parseError.stack });
          history = [];
        }
      }
      
      // Add new calculation to the beginning of the array
      history.unshift(calculation);
      
      // Limit history size to prevent ever-growing cache
      const MAX_HISTORY_ITEMS = 100;
      if (history.length > MAX_HISTORY_ITEMS) {
        history = history.slice(0, MAX_HISTORY_ITEMS);
        logger.debug(`Trimmed history for user ${userId} to ${MAX_HISTORY_ITEMS} items`);
      }
      
      // Store updated history in cache
      pipeline.set(cacheKey, JSON.stringify(history));
      pipeline.expire(cacheKey, CACHE_TTL);
      
      // Execute the pipeline
      await pipeline.exec();
      
      logger.debug(`Updated history cache for user ${userId}`);
    } catch (error) {
      logger.error(`Error updating history cache: ${error.message}`, { error: error.stack });
      await monitoring.trackError('co2Calculator', 'CacheUpdateError', error.message);
    }
  } catch (error) {
    logger.error(`Critical error in updateUserHistoryCache: ${error.message}`, { error: error.stack });
    await monitoring.trackError('co2Calculator', 'CriticalCacheError', error.message);
    // Don't throw - this is a non-critical operation
  }
}

module.exports = {
  CO2Calculator,
  calculateCO2,
  saveCalculation,
  getUserHistory,
  getEmissionFactors,
  EMISSION_FACTORS: DEFAULT_EMISSION_FACTORS
}; 