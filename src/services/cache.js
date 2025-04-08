const NodeCache = require('node-cache');
const logger = require('./logger');

// Create a cache instance with default TTL of 1 hour
const cache = new NodeCache({
  stdTTL: process.env.CACHE_TTL || 3600,
  checkperiod: 600, // Check for expired keys every 10 minutes
  useClones: false
});

// Cache events
cache.on('expired', (key, value) => {
  logger.debug(`Cache key expired: ${key}`);
});

cache.on('del', (key, value) => {
  logger.debug(`Cache key deleted: ${key}`);
});

/**
 * Get a value from cache
 * @param {String} key - Cache key
 * @returns {Any} Cached value or undefined if not found
 */
const get = (key) => {
  try {
    return cache.get(key);
  } catch (error) {
    logger.error(`Error getting from cache: ${error.message}`);
    return undefined;
  }
};

/**
 * Set a value in cache
 * @param {String} key - Cache key
 * @param {Any} value - Value to cache
 * @param {Number} ttl - Time to live in seconds (optional)
 * @returns {Boolean} Success status
 */
const set = (key, value, ttl = null) => {
  try {
    return cache.set(key, value, ttl);
  } catch (error) {
    logger.error(`Error setting cache: ${error.message}`);
    return false;
  }
};

/**
 * Delete a value from cache
 * @param {String} key - Cache key
 * @returns {Number} Number of keys deleted
 */
const del = (key) => {
  try {
    return cache.del(key);
  } catch (error) {
    logger.error(`Error deleting from cache: ${error.message}`);
    return 0;
  }
};

/**
 * Clear all cache
 * @returns {Boolean} Success status
 */
const clear = () => {
  try {
    cache.flushAll();
    return true;
  } catch (error) {
    logger.error(`Error clearing cache: ${error.message}`);
    return false;
  }
};

/**
 * Get cache stats
 * @returns {Object} Cache statistics
 */
const stats = () => {
  return cache.getStats();
};

module.exports = {
  get,
  set,
  del,
  clear,
  stats
}; 