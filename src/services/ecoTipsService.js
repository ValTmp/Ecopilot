/**
 * EcoTips Service
 * Provides personalized CO2 reduction tips based on user's transportation habits
 */

const redis = require('../config/redis');
const logger = require('./logger');
const monitoring = require('./monitoring');
const { performance } = require('perf_hooks');

// Constants
const TIPS_CACHE_TTL = 60 * 60 * 24; // 1 day in seconds
const TIPS_CACHE_KEY = 'eco:tips:';
const MAX_FAVORITES_PER_USER = 50; // Limit the number of favorites per user

// Valid transport types
const VALID_TRANSPORT_TYPES = ['car', 'plane', 'public'];

// Define transportation types and their respective tips
const TRANSPORT_TIPS = {
  car: [
    {
      id: 'car-1',
      tip: 'Try carpooling with colleagues or neighbors to reduce per-person emissions.',
      impact: 'high',
      category: 'behavioral'
    },
    {
      id: 'car-2',
      tip: 'Ensure your tires are properly inflated - this can improve fuel efficiency by up to 3%.',
      impact: 'medium',
      category: 'maintenance'
    },
    {
      id: 'car-3',
      tip: 'Remove unnecessary weight from your car - every 45kg reduces fuel efficiency by 1-2%.',
      impact: 'medium',
      category: 'behavioral'
    },
    {
      id: 'car-4',
      tip: 'Consider switching to an electric or hybrid vehicle for your next purchase.',
      impact: 'high',
      category: 'investment'
    },
    {
      id: 'car-5',
      tip: 'Try to combine multiple errands into a single trip to reduce total distance traveled.',
      impact: 'medium',
      category: 'planning'
    }
  ],
  plane: [
    {
      id: 'plane-1',
      tip: 'Choose direct flights when possible - takeoffs and landings use the most fuel.',
      impact: 'medium',
      category: 'planning'
    },
    {
      id: 'plane-2',
      tip: 'Consider trains for shorter trips - they often produce 75% less emissions than flying.',
      impact: 'high',
      category: 'alternative'
    },
    {
      id: 'plane-3',
      tip: 'Pack lighter - every kg contributes to the plane\'s fuel consumption.',
      impact: 'low',
      category: 'behavioral'
    },
    {
      id: 'plane-4',
      tip: 'When booking flights, look for newer aircraft models which are typically more fuel-efficient.',
      impact: 'medium',
      category: 'planning'
    },
    {
      id: 'plane-5',
      tip: 'Consider purchasing carbon offsets for your flights to neutralize your impact.',
      impact: 'high',
      category: 'investment'
    }
  ],
  public: [
    {
      id: 'public-1',
      tip: 'Great choice! Public transportation significantly reduces per-person emissions.',
      impact: 'info',
      category: 'affirmation'
    },
    {
      id: 'public-2',
      tip: 'For very short distances, consider walking or cycling for zero emissions.',
      impact: 'high',
      category: 'alternative'
    },
    {
      id: 'public-3',
      tip: 'Travel during off-peak hours when possible for more efficient service.',
      impact: 'low',
      category: 'planning'
    },
    {
      id: 'public-4',
      tip: 'Advocate for better public transportation in your community.',
      impact: 'medium',
      category: 'advocacy'
    },
    {
      id: 'public-5',
      tip: 'Consider using electric scooters or bike-sharing for last-mile transportation.',
      impact: 'medium',
      category: 'alternative'
    }
  ],
  general: [
    {
      id: 'general-1',
      tip: 'Consider remote work options when available to eliminate commuting emissions.',
      impact: 'high',
      category: 'lifestyle'
    },
    {
      id: 'general-2',
      tip: 'Plan your trips efficiently to minimize unnecessary travel.',
      impact: 'medium',
      category: 'planning'
    },
    {
      id: 'general-3',
      tip: 'Try to shop locally to reduce transportation emissions from goods.',
      impact: 'medium',
      category: 'lifestyle'
    }
  ]
};

/**
 * Get personalized eco tips based on user's transportation habits
 * @param {string} userId - User ID
 * @param {string} transportType - Type of transport (car, plane, public)
 * @param {number} distance - Distance traveled
 * @returns {Promise<Array>} - Array of personalized tips
 */
async function getPersonalizedTips(userId, transportType, distance) {
  const start = performance.now();
  
  try {
    // Validate inputs
    if (!userId || !transportType) {
      throw new Error('User ID and transport type are required');
    }
    
    // Validate transport type
    if (!VALID_TRANSPORT_TYPES.includes(transportType)) {
      logger.warn(`Invalid transport type requested: ${transportType}`);
      transportType = 'general'; // Fallback to general tips
    }
    
    // Check if tips are cached
    const cacheKey = `${TIPS_CACHE_KEY}${userId}:${transportType}`;
    let cachedTips;
    
    try {
      cachedTips = await redis.get(cacheKey);
    } catch (redisError) {
      // Redis connection error - log and continue without cache
      logger.error(`Redis connection error: ${redisError.message}`, { error: redisError.stack });
      await monitoring.trackError('redis', 'ConnectionError', redisError.message);
      // Continue without cache
    }
    
    if (cachedTips) {
      try {
        // Track cache hit
        await monitoring.trackCacheHit('eco_tips');
        logger.debug(`Retrieved eco tips from cache for user ${userId}`);
        
        const end = performance.now();
        await monitoring.trackResponseTime('getPersonalizedTips', end - start, true);
        
        return JSON.parse(cachedTips);
      } catch (parseError) {
        logger.error(`Error parsing cached eco tips: ${parseError.message}`);
        // Continue to generate new tips if parsing fails
      }
    }
    
    // Track cache miss
    await monitoring.trackCacheMiss('eco_tips');
    
    // Get tips for the specific transport type
    let tips = [];
    
    // Add transport-specific tips
    if (TRANSPORT_TIPS[transportType]) {
      tips = [...TRANSPORT_TIPS[transportType]];
    }
    
    // Add general tips
    tips = [...tips, ...TRANSPORT_TIPS.general];
    
    // Personalize based on distance
    if (distance > 100) {
      tips.push({
        id: 'distance-1',
        tip: 'For longer trips, consider alternatives like trains or buses which often have lower emissions.',
        impact: 'high',
        category: 'alternative'
      });
    } else if (distance < 5) {
      tips.push({
        id: 'distance-2',
        tip: 'For such short distances, walking or cycling would produce zero emissions and improve your health.',
        impact: 'high',
        category: 'alternative'
      });
    }
    
    // Shuffle and limit to 3 tips
    tips = shuffleArray(tips).slice(0, 3);
    
    // Cache the tips
    try {
      await redis.set(cacheKey, JSON.stringify(tips));
      await redis.expire(cacheKey, TIPS_CACHE_TTL);
      logger.debug(`Generated and cached personalized eco tips for user ${userId}`);
    } catch (redisError) {
      logger.error(`Failed to cache eco tips: ${redisError.message}`, { error: redisError.stack });
      // Continue without caching
    }
    
    const end = performance.now();
    await monitoring.trackResponseTime('getPersonalizedTips', end - start, false);
    
    return tips;
  } catch (error) {
    logger.error(`Error getting personalized eco tips: ${error.message}`, { error: error.stack });
    await monitoring.trackError('ecoTips', 'GetTipsError', error.message);
    
    // Return general tips if there's an error
    return TRANSPORT_TIPS.general;
  }
}

/**
 * Helper function to shuffle an array
 * @param {Array} array - Array to shuffle
 * @returns {Array} - Shuffled array
 */
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

/**
 * Get tips by category
 * @param {string} category - Category of tips to retrieve
 * @returns {Array} - Tips in the specified category
 */
function getTipsByCategory(category) {
  const allTips = [
    ...TRANSPORT_TIPS.car,
    ...TRANSPORT_TIPS.plane,
    ...TRANSPORT_TIPS.public,
    ...TRANSPORT_TIPS.general
  ];
  
  return allTips.filter(tip => tip.category === category);
}

/**
 * Get all available tip categories
 * @returns {Array} - List of unique tip categories
 */
function getTipCategories() {
  const allTips = [
    ...TRANSPORT_TIPS.car,
    ...TRANSPORT_TIPS.plane,
    ...TRANSPORT_TIPS.public,
    ...TRANSPORT_TIPS.general
  ];
  
  const categories = new Set(allTips.map(tip => tip.category));
  return Array.from(categories);
}

/**
 * Save a tip to user's favorites
 * @param {string} userId - User ID
 * @param {string} tipId - Tip ID to save
 * @returns {Promise<boolean>} - Success status
 */
async function saveTipToFavorites(userId, tipId) {
  try {
    // Validate inputs
    if (!userId || !tipId) {
      throw new Error('User ID and tip ID are required');
    }
    
    // Check if tip exists
    const allTips = [
      ...TRANSPORT_TIPS.car,
      ...TRANSPORT_TIPS.plane,
      ...TRANSPORT_TIPS.public,
      ...TRANSPORT_TIPS.general
    ];
    
    const tipExists = allTips.some(tip => tip.id === tipId);
    if (!tipExists) {
      logger.warn(`Attempted to save non-existent tip ${tipId}`);
      return false;
    }
    
    // Get favorite tips from Redis
    const favoriteKey = `eco:favorite_tips:${userId}`;
    let favorites = [];
    let cachedFavorites;
    
    try {
      cachedFavorites = await redis.get(favoriteKey);
    } catch (redisError) {
      logger.error(`Redis error retrieving favorites: ${redisError.message}`, { error: redisError.stack });
      return false;
    }
    
    if (cachedFavorites) {
      try {
        favorites = JSON.parse(cachedFavorites);
      } catch (parseError) {
        logger.error(`Error parsing favorite tips: ${parseError.message}`);
        favorites = [];
      }
    }
    
    // Check if tip is already in favorites
    if (favorites.includes(tipId)) {
      return true; // Already saved
    }
    
    // Limit number of favorites per user
    if (favorites.length >= MAX_FAVORITES_PER_USER) {
      // Remove oldest favorite
      favorites.shift();
      logger.debug(`User ${userId} reached favorites limit, removed oldest favorite`);
    }
    
    // Add to favorites
    favorites.push(tipId);
    
    // Use Redis pipeline for multiple operations
    try {
      const pipeline = redis.pipeline();
      
      // Save to Redis
      pipeline.set(favoriteKey, JSON.stringify(favorites));
      
      // Invalidate dependent caches
      const personalizedTipsKey = `${TIPS_CACHE_KEY}${userId}:*`;
      const keysToInvalidate = await redis.keys(personalizedTipsKey);
      
      if (keysToInvalidate.length > 0) {
        pipeline.del(keysToInvalidate);
        logger.debug(`Invalidated ${keysToInvalidate.length} personalized tips caches for user ${userId}`);
      }
      
      await pipeline.exec();
    } catch (redisError) {
      logger.error(`Redis error saving favorites: ${redisError.message}`, { error: redisError.stack });
      return false;
    }
    
    logger.debug(`Saved tip ${tipId} to favorites for user ${userId}`);
    
    return true;
  } catch (error) {
    logger.error(`Error saving tip to favorites: ${error.message}`, { error: error.stack });
    await monitoring.trackError('ecoTips', 'SaveFavoriteError', error.message);
    return false;
  }
}

/**
 * Remove a tip from user's favorites
 * @param {string} userId - User ID
 * @param {string} tipId - Tip ID to remove
 * @returns {Promise<boolean>} - Success status
 */
async function removeTipFromFavorites(userId, tipId) {
  try {
    // Validate inputs
    if (!userId || !tipId) {
      throw new Error('User ID and tip ID are required');
    }
    
    // Get favorite tips from Redis
    const favoriteKey = `eco:favorite_tips:${userId}`;
    let cachedFavorites;
    
    try {
      cachedFavorites = await redis.get(favoriteKey);
    } catch (redisError) {
      logger.error(`Redis error retrieving favorites: ${redisError.message}`, { error: redisError.stack });
      return false;
    }
    
    if (!cachedFavorites) {
      return true; // No favorites
    }
    
    let favorites = [];
    try {
      favorites = JSON.parse(cachedFavorites);
    } catch (parseError) {
      logger.error(`Error parsing favorite tips: ${parseError.message}`);
      return false;
    }
    
    // Check if tip exists in favorites
    if (!favorites.includes(tipId)) {
      return true; // Tip not in favorites
    }
    
    // Remove tip from favorites
    favorites = favorites.filter(id => id !== tipId);
    
    // Use Redis pipeline for multiple operations
    try {
      const pipeline = redis.pipeline();
      
      // Save to Redis
      pipeline.set(favoriteKey, JSON.stringify(favorites));
      
      // Invalidate dependent caches
      const personalizedTipsKey = `${TIPS_CACHE_KEY}${userId}:*`;
      const keysToInvalidate = await redis.keys(personalizedTipsKey);
      
      if (keysToInvalidate.length > 0) {
        pipeline.del(keysToInvalidate);
        logger.debug(`Invalidated ${keysToInvalidate.length} personalized tips caches for user ${userId}`);
      }
      
      await pipeline.exec();
    } catch (redisError) {
      logger.error(`Redis error updating favorites: ${redisError.message}`, { error: redisError.stack });
      return false;
    }
    
    logger.debug(`Removed tip ${tipId} from favorites for user ${userId}`);
    
    return true;
  } catch (error) {
    logger.error(`Error removing tip from favorites: ${error.message}`, { error: error.stack });
    await monitoring.trackError('ecoTips', 'RemoveFavoriteError', error.message);
    return false;
  }
}

/**
 * Get user's favorite tips
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of favorite tips
 */
async function getFavoriteTips(userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    // Get favorite tips from Redis
    const favoriteKey = `eco:favorite_tips:${userId}`;
    let cachedFavorites;
    
    try {
      cachedFavorites = await redis.get(favoriteKey);
    } catch (redisError) {
      logger.error(`Redis error retrieving favorites: ${redisError.message}`, { error: redisError.stack });
      return [];
    }
    
    if (!cachedFavorites) {
      return []; // No favorites
    }
    
    let favoriteIds = [];
    try {
      favoriteIds = JSON.parse(cachedFavorites);
    } catch (parseError) {
      logger.error(`Error parsing favorite tips: ${parseError.message}`);
      return [];
    }
    
    // Get all tips
    const allTips = [
      ...TRANSPORT_TIPS.car,
      ...TRANSPORT_TIPS.plane,
      ...TRANSPORT_TIPS.public,
      ...TRANSPORT_TIPS.general
    ];
    
    // Filter to get only favorites
    const favorites = allTips.filter(tip => favoriteIds.includes(tip.id));
    
    return favorites;
  } catch (error) {
    logger.error(`Error getting favorite tips: ${error.message}`, { error: error.stack });
    await monitoring.trackError('ecoTips', 'GetFavoritesError', error.message);
    return [];
  }
}

module.exports = {
  getPersonalizedTips,
  getTipsByCategory,
  getTipCategories,
  saveTipToFavorites,
  removeTipFromFavorites,
  getFavoriteTips,
  TRANSPORT_TIPS,
  MAX_FAVORITES_PER_USER
}; 