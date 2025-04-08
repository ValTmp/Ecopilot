/**
 * Recommendation Service
 * 
 * Service for generating personalized CO2 reduction recommendations
 * based on user data and history of calculations.
 */

const co2Calculator = require('./co2Calculator');
const redis = require('../config/redis');
const logger = require('./logger');

// Cache TTL for recommendations
const CACHE_TTL = 3600; // 1 hour

// Recommendation categories
const CATEGORIES = {
  TRANSPORTATION: {
    id: 'transportation',
    name: 'Transportation',
    description: 'Optimize your travel to reduce emissions'
  },
  BEHAVIORAL: {
    id: 'behavioral',
    name: 'Behavioral Changes',
    description: 'Small habit changes with big impact'
  },
  PLANNING: {
    id: 'planning',
    name: 'Planning & Logistics',
    description: 'Better planning for lower emissions'
  },
  INVESTMENT: {
    id: 'investment',
    name: 'Green Investments',
    description: 'Invest in sustainable technologies'
  }
};

/**
 * Get all recommendation categories
 * @returns {Array} List of recommendation categories
 */
function getCategories() {
  return Object.values(CATEGORIES);
}

/**
 * Generate personalized recommendations based on user's CO2 calculation history
 * @param {string} userId - User ID
 * @returns {Promise<Array>} List of personalized recommendations
 */
async function getRecommendations(userId) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Check cache first
  const cacheKey = `recommendations:${userId}`;
  try {
    const cachedRecommendations = await redis.get(cacheKey);
    if (cachedRecommendations) {
      logger.info(`Cache hit for recommendations for user ${userId}`);
      return JSON.parse(cachedRecommendations);
    }
    
    logger.info(`Cache miss for recommendations for user ${userId}`);
    
    // Get user's CO2 calculation history
    const userHistory = await co2Calculator.getUserHistory(userId);
    
    // Generate recommendations based on history
    const recommendations = generateRecommendations(userHistory);
    
    // Cache recommendations
    await redis.set(cacheKey, JSON.stringify(recommendations), 'EX', CACHE_TTL);
    
    return recommendations;
  } catch (error) {
    logger.error(`Error getting recommendations for user ${userId}: ${error.message}`);
    throw error;
  }
}

/**
 * Generate recommendations based on user history
 * @param {Array} userHistory - User's CO2 calculation history
 * @returns {Array} List of recommendations
 */
function generateRecommendations(userHistory) {
  const recommendations = [];
  
  if (!userHistory || userHistory.length === 0) {
    // Default recommendations for users with no history
    return getDefaultRecommendations();
  }
  
  // Analyze transportation types
  const transportTypes = countTransportTypes(userHistory);
  const mostUsedTransport = getMostUsedTransport(transportTypes);
  
  // Calculate average distances
  const avgDistance = calculateAverageDistance(userHistory);
  
  // Add transport-specific recommendations
  if (mostUsedTransport === 'car') {
    recommendations.push({
      id: 'car-pooling',
      category: CATEGORIES.TRANSPORTATION.id,
      title: 'Start Carpooling',
      description: 'Share rides with colleagues or neighbors to reduce per-person emissions',
      impact: 'Medium',
      difficulty: 'Low'
    });
    
    recommendations.push({
      id: 'ev-switch',
      category: CATEGORIES.INVESTMENT.id,
      title: 'Consider Electric Vehicles',
      description: 'Electric vehicles produce significantly fewer emissions than gas-powered cars',
      impact: 'High',
      difficulty: 'High'
    });
  }
  
  if (mostUsedTransport === 'plane') {
    recommendations.push({
      id: 'fewer-flights',
      category: CATEGORIES.PLANNING.id,
      title: 'Reduce Flight Frequency',
      description: 'Consider combining trips or using video conferencing instead of flying',
      impact: 'High',
      difficulty: 'Medium'
    });
    
    recommendations.push({
      id: 'offset-flights',
      category: CATEGORIES.INVESTMENT.id,
      title: 'Offset Your Flights',
      description: 'Purchase carbon offsets for unavoidable flights',
      impact: 'Medium',
      difficulty: 'Low'
    });
  }
  
  // Add general recommendations
  recommendations.push({
    id: 'public-transport',
    category: CATEGORIES.TRANSPORTATION.id,
    title: 'Use Public Transportation',
    description: 'Public transit has a lower carbon footprint per passenger than private vehicles',
    impact: 'High',
    difficulty: 'Medium'
  });
  
  if (avgDistance < 5) {
    recommendations.push({
      id: 'walk-bike',
      category: CATEGORIES.BEHAVIORAL.id,
      title: 'Walk or Bike for Short Trips',
      description: 'For trips under 5km, consider walking or biking instead of driving',
      impact: 'Medium',
      difficulty: 'Low'
    });
  }
  
  return recommendations.slice(0, 5); // Return top 5 recommendations
}

/**
 * Count occurrences of each transport type in user history
 * @param {Array} userHistory - User's CO2 calculation history
 * @returns {Object} Count of each transport type
 */
function countTransportTypes(userHistory) {
  return userHistory.reduce((counts, entry) => {
    const type = entry.transportType || '';
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
}

/**
 * Get the most frequently used transport type
 * @param {Object} transportCounts - Count of each transport type
 * @returns {string} Most used transport type
 */
function getMostUsedTransport(transportCounts) {
  let maxCount = 0;
  let mostUsed = '';
  
  for (const [type, count] of Object.entries(transportCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostUsed = type;
    }
  }
  
  return mostUsed;
}

/**
 * Calculate the average distance from user history
 * @param {Array} userHistory - User's CO2 calculation history
 * @returns {number} Average distance
 */
function calculateAverageDistance(userHistory) {
  if (userHistory.length === 0) return 0;
  
  const total = userHistory.reduce((sum, entry) => sum + (entry.distance || 0), 0);
  return total / userHistory.length;
}

/**
 * Get default recommendations for new users
 * @returns {Array} Default recommendations
 */
function getDefaultRecommendations() {
  return [
    {
      id: 'public-transport',
      category: CATEGORIES.TRANSPORTATION.id,
      title: 'Use Public Transportation',
      description: 'Public transit has a lower carbon footprint per passenger than private vehicles',
      impact: 'High',
      difficulty: 'Medium'
    },
    {
      id: 'walk-bike',
      category: CATEGORIES.BEHAVIORAL.id,
      title: 'Walk or Bike for Short Trips',
      description: 'For trips under 5km, consider walking or biking instead of driving',
      impact: 'Medium',
      difficulty: 'Low'
    },
    {
      id: 'home-energy',
      category: CATEGORIES.BEHAVIORAL.id,
      title: 'Reduce Home Energy Usage',
      description: 'Turn off lights and appliances when not in use',
      impact: 'Medium',
      difficulty: 'Low'
    }
  ];
}

/**
 * Record user feedback for a recommendation
 * @param {string} userId - User ID
 * @param {string} recommendationId - Recommendation ID
 * @param {boolean} isHelpful - Whether the recommendation was helpful
 * @returns {Promise<Object>} Feedback result
 */
async function recordFeedback(userId, recommendationId, isHelpful) {
  if (!userId || !recommendationId) {
    throw new Error('User ID and recommendation ID are required');
  }
  
  try {
    // Log feedback
    logger.co2(`User ${userId} rated recommendation ${recommendationId} as ${isHelpful ? 'helpful' : 'not helpful'}`);
    
    // In a real system, we would store this feedback in a database
    // For now, we'll just invalidate the cache to force new recommendations
    const cacheKey = `recommendations:${userId}`;
    await redis.del(cacheKey);
    
    return { success: true };
  } catch (error) {
    logger.error(`Error recording recommendation feedback: ${error.message}`);
    throw error;
  }
}

module.exports = {
  getCategories,
  getRecommendations,
  recordFeedback
}; 