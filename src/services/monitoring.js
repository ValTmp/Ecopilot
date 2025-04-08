/**
 * Monitoring Service for EcoPilot
 * Tracks performance metrics and caching effectiveness
 */

const redis = require('./redis');
const logger = require('./logger');
const { performance } = require('perf_hooks');

// Constants
const METRICS_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

// Redis key prefixes
const CACHE_HIT_KEY = 'metrics:cache:hit:';
const CACHE_MISS_KEY = 'metrics:cache:miss:';
const RESPONSE_TIME_KEY = 'metrics:response_time:';
const HIT_RATIO_KEY = 'metrics:hit_ratio:';
const ENDPOINT_USAGE_KEY = 'metrics:endpoint:';
const ERROR_KEY = 'metrics:error:';
const ERROR_DETAIL_KEY = 'metrics:error_detail:';

/**
 * Track a cache hit for a service
 * @param {string} service - The service name
 */
async function trackCacheHit(service) {
  const date = new Date().toISOString().split('T')[0];
  const key = `${CACHE_HIT_KEY}${service}:${date}`;
  
  try {
    await redis.hincrby(key, 'count', 1);
    await redis.expire(key, METRICS_TTL);
    await updateHitRatio(service);
    logger.debug(`Cache hit tracked for ${service}`);
  } catch (error) {
    logger.error(`Failed to track cache hit for ${service}:`, error);
  }
}

/**
 * Track a cache miss for a service
 * @param {string} service - The service name
 */
async function trackCacheMiss(service) {
  const date = new Date().toISOString().split('T')[0];
  const key = `${CACHE_MISS_KEY}${service}:${date}`;
  
  try {
    await redis.hincrby(key, 'count', 1);
    await redis.expire(key, METRICS_TTL);
    await updateHitRatio(service);
    logger.debug(`Cache miss tracked for ${service}`);
  } catch (error) {
    logger.error(`Failed to track cache miss for ${service}:`, error);
  }
}

/**
 * Track response time for an operation
 * @param {string} operation - The operation name
 * @param {number} timeMs - Response time in milliseconds
 * @param {boolean} fromCache - Whether the response came from cache
 */
async function trackResponseTime(operation, timeMs, fromCache) {
  const date = new Date().toISOString().split('T')[0];
  const source = fromCache ? 'cached' : 'uncached';
  const key = `${RESPONSE_TIME_KEY}${operation}:${source}:${date}`;
  
  try {
    // Get current values to calculate running average
    const current = await redis.hgetall(key) || { count: '0', total: '0', avg: '0', min: timeMs.toString(), max: timeMs.toString() };
    
    // Parse values
    const count = parseInt(current.count || '0', 10) + 1;
    const total = parseFloat(current.total || '0') + timeMs;
    const avg = total / count;
    const min = Math.min(parseFloat(current.min || timeMs), timeMs);
    const max = Math.max(parseFloat(current.max || timeMs), timeMs);
    
    // Update metrics
    await redis.hmset(key, {
      'count': count,
      'total': total,
      'avg': avg.toFixed(2),
      'min': min.toFixed(2),
      'max': max.toFixed(2)
    });
    
    await redis.expire(key, METRICS_TTL);
    logger.debug(`Response time tracked for ${operation} (${source}): ${timeMs}ms`);
  } catch (error) {
    logger.error(`Failed to track response time for ${operation}:`, error);
  }
}

/**
 * Track API endpoint usage
 * @param {string} endpoint - The API endpoint path
 * @param {number} statusCode - The HTTP status code
 */
async function trackEndpointUsage(endpoint, statusCode) {
  const date = new Date().toISOString().split('T')[0];
  const key = `${ENDPOINT_USAGE_KEY}${date}`;
  
  try {
    // Track total count for endpoint
    await redis.hincrby(key, endpoint, 1);
    
    // Track count by status code
    await redis.hincrby(key, `${endpoint}:${statusCode}`, 1);
    
    await redis.expire(key, METRICS_TTL);
    logger.debug(`Endpoint usage tracked: ${endpoint} (${statusCode})`);
  } catch (error) {
    logger.error(`Failed to track endpoint usage for ${endpoint}:`, error);
  }
}

/**
 * Track an error occurrence
 * @param {string} service - The service name
 * @param {string} errorType - The type of error
 * @param {string} message - Error message
 */
async function trackError(service, errorType, message) {
  const date = new Date().toISOString().split('T')[0];
  const key = `${ERROR_KEY}${service}:${date}`;
  const detailKey = `${ERROR_DETAIL_KEY}${service}:${errorType}`;
  
  try {
    // Increment error count
    await redis.hincrby(key, errorType, 1);
    await redis.expire(key, METRICS_TTL);
    
    // Store error details (limited to latest 100 errors)
    const timestamp = new Date().toISOString();
    const errorDetail = JSON.stringify({ timestamp, message });
    
    await redis.lpush(detailKey, errorDetail);
    await redis.ltrim(detailKey, 0, 99); // Keep only the last 100 errors
    await redis.expire(detailKey, METRICS_TTL);
    
    logger.error(`Error tracked for ${service} (${errorType}): ${message}`);
  } catch (error) {
    logger.error(`Failed to track error for ${service}:`, error);
  }
}

/**
 * Update the cache hit ratio for a service
 * @param {string} service - The service name
 */
async function updateHitRatio(service) {
  const date = new Date().toISOString().split('T')[0];
  const hitKey = `${CACHE_HIT_KEY}${service}:${date}`;
  const missKey = `${CACHE_MISS_KEY}${service}:${date}`;
  const ratioKey = `${HIT_RATIO_KEY}${service}:${date}`;
  
  try {
    const hits = parseInt(await redis.hget(hitKey, 'count') || '0', 10);
    const misses = parseInt(await redis.hget(missKey, 'count') || '0', 10);
    
    if (hits + misses > 0) {
      const ratio = (hits / (hits + misses) * 100).toFixed(2);
      await redis.set(ratioKey, ratio);
      await redis.expire(ratioKey, METRICS_TTL);
    }
  } catch (error) {
    logger.error(`Failed to update hit ratio for ${service}:`, error);
  }
}

/**
 * Get cache metrics for a service
 * @param {string} service - The service name
 * @param {number} days - Number of days to retrieve (default: 7)
 * @returns {Object} - Cache metrics
 */
async function getCacheMetrics(service, days = 7) {
  try {
    const dateLabels = [];
    const dailyHits = [];
    const dailyMisses = [];
    const dailyHitRatios = [];
    const dailyCachedResponseTimes = [];
    const dailyUncachedResponseTimes = [];
    
    let totalHits = 0;
    let totalMisses = 0;
    
    // Get metrics for each day
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dateLabels.push(dateStr);
      
      // Get hits
      const hitKey = `${CACHE_HIT_KEY}${service}:${dateStr}`;
      const hits = parseInt(await redis.hget(hitKey, 'count') || '0', 10);
      dailyHits.push(hits);
      totalHits += hits;
      
      // Get misses
      const missKey = `${CACHE_MISS_KEY}${service}:${dateStr}`;
      const misses = parseInt(await redis.hget(missKey, 'count') || '0', 10);
      dailyMisses.push(misses);
      totalMisses += misses;
      
      // Get hit ratio
      const ratioKey = `${HIT_RATIO_KEY}${service}:${dateStr}`;
      const ratio = parseFloat(await redis.get(ratioKey) || '0');
      dailyHitRatios.push(ratio);
      
      // Get cached response times
      const cachedKey = `${RESPONSE_TIME_KEY}${service}:cached:${dateStr}`;
      const cachedData = await redis.hgetall(cachedKey) || { avg: '0' };
      dailyCachedResponseTimes.push(parseFloat(cachedData.avg || '0'));
      
      // Get uncached response times
      const uncachedKey = `${RESPONSE_TIME_KEY}${service}:uncached:${dateStr}`;
      const uncachedData = await redis.hgetall(uncachedKey) || { avg: '0' };
      dailyUncachedResponseTimes.push(parseFloat(uncachedData.avg || '0'));
    }
    
    // Calculate aggregate metrics
    const hitRatio = totalHits + totalMisses > 0 
      ? (totalHits / (totalHits + totalMisses) * 100).toFixed(2) 
      : 0;
    
    const avgCachedTime = dailyCachedResponseTimes.filter(t => t > 0).length > 0
      ? (dailyCachedResponseTimes.reduce((sum, time) => sum + (time > 0 ? time : 0), 0) / 
        dailyCachedResponseTimes.filter(t => t > 0).length).toFixed(2)
      : 0;
    
    const avgUncachedTime = dailyUncachedResponseTimes.filter(t => t > 0).length > 0
      ? (dailyUncachedResponseTimes.reduce((sum, time) => sum + (time > 0 ? time : 0), 0) / 
        dailyUncachedResponseTimes.filter(t => t > 0).length).toFixed(2)
      : 0;
    
    return {
      service,
      totalHits,
      totalMisses,
      hitRatio,
      avgCachedTime,
      avgUncachedTime,
      dateLabels,
      dailyHits,
      dailyMisses,
      dailyHitRatios,
      dailyCachedResponseTimes,
      dailyUncachedResponseTimes
    };
  } catch (error) {
    logger.error(`Failed to get cache metrics for ${service}:`, error);
    return {
      service,
      totalHits: 0,
      totalMisses: 0,
      hitRatio: 0,
      avgCachedTime: 0,
      avgUncachedTime: 0,
      dateLabels: [],
      dailyHits: [],
      dailyMisses: [],
      dailyHitRatios: [],
      dailyCachedResponseTimes: [],
      dailyUncachedResponseTimes: []
    };
  }
}

/**
 * Get response time metrics for an operation
 * @param {string} operation - The operation name
 * @param {boolean} fromCache - Whether to get metrics for cached responses
 * @param {number} days - Number of days to retrieve
 * @returns {Object} - Response time metrics
 */
async function getResponseTimeMetrics(operation, fromCache, days = 7) {
  try {
    const source = fromCache ? 'cached' : 'uncached';
    const dateLabels = [];
    const avgTimes = [];
    const minTimes = [];
    const maxTimes = [];
    
    let totalAvg = 0;
    let totalMin = Number.MAX_SAFE_INTEGER;
    let totalMax = 0;
    let totalCount = 0;
    
    // Get metrics for each day
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dateLabels.push(dateStr);
      
      const key = `${RESPONSE_TIME_KEY}${operation}:${source}:${dateStr}`;
      const data = await redis.hgetall(key) || { avg: '0', min: '0', max: '0', count: '0' };
      
      avgTimes.push(parseFloat(data.avg || '0'));
      minTimes.push(parseFloat(data.min || '0'));
      maxTimes.push(parseFloat(data.max || '0'));
      
      const count = parseInt(data.count || '0', 10);
      if (count > 0) {
        totalAvg = (totalAvg * totalCount + parseFloat(data.avg) * count) / (totalCount + count);
        totalMin = Math.min(totalMin, parseFloat(data.min || totalMin));
        totalMax = Math.max(totalMax, parseFloat(data.max || '0'));
        totalCount += count;
      }
    }
    
    if (totalCount === 0) {
      totalMin = 0;
    }
    
    return {
      operation,
      source,
      totalAvg: totalAvg.toFixed(2),
      totalMin: totalMin.toFixed(2),
      totalMax: totalMax.toFixed(2),
      totalCount,
      dateLabels,
      avgTimes,
      minTimes,
      maxTimes
    };
  } catch (error) {
    logger.error(`Failed to get response time metrics for ${operation}:`, error);
    return {
      operation,
      source,
      totalAvg: 0,
      totalMin: 0,
      totalMax: 0,
      totalCount: 0,
      dateLabels: [],
      avgTimes: [],
      minTimes: [],
      maxTimes: []
    };
  }
}

/**
 * Get error metrics for a service
 * @param {string} service - The service name (null for all services)
 * @param {number} days - Number of days to retrieve
 * @returns {Array} - Error metrics
 */
async function getErrorMetrics(service, days = 7) {
  try {
    const errors = [];
    const pattern = service ? `${ERROR_KEY}${service}:*` : `${ERROR_KEY}*`;
    
    // Get all keys matching the pattern
    const keys = await redis.keys(pattern);
    
    // Filter keys for the specified time range
    for (const key of keys) {
      const keyParts = key.split(':');
      const keyDate = keyParts[keyParts.length - 1];
      const keyService = key.replace(`${ERROR_KEY}`, '').replace(`:${keyDate}`, '');
      
      // Check if the date is within the range
      const date = new Date(keyDate);
      const today = new Date();
      const diff = Math.floor((today - date) / (1000 * 60 * 60 * 24));
      
      if (diff <= days) {
        // Get error types and counts
        const errorData = await redis.hgetall(key);
        
        // Get last occurrence for each error type
        for (const [errorType, count] of Object.entries(errorData)) {
          const detailKey = `${ERROR_DETAIL_KEY}${keyService}:${errorType}`;
          const latestError = await redis.lindex(detailKey, 0);
          
          let lastOccurrence = null;
          try {
            if (latestError) {
              const errorDetail = JSON.parse(latestError);
              lastOccurrence = errorDetail.timestamp;
            }
          } catch (e) {
            logger.error(`Failed to parse error detail for ${keyService}:${errorType}:`, e);
          }
          
          errors.push({
            service: keyService,
            type: errorType,
            count: parseInt(count, 10),
            lastOccurrence: lastOccurrence || new Date().toISOString()
          });
        }
      }
    }
    
    return errors;
  } catch (error) {
    logger.error(`Failed to get error metrics:`, error);
    return [];
  }
}

/**
 * Get detailed error logs
 * @param {string} service - The service name
 * @param {string} errorType - The error type
 * @param {number} limit - Maximum number of errors to retrieve
 * @returns {Array} - Detailed error logs
 */
async function getDetailedErrors(service, errorType, limit = 50) {
  try {
    if (!service || !errorType) {
      const allErrors = [];
      const pattern = service 
        ? `${ERROR_DETAIL_KEY}${service}:*` 
        : `${ERROR_DETAIL_KEY}*`;
      
      const keys = await redis.keys(pattern);
      const limitPerKey = Math.ceil(limit / keys.length);
      
      for (const key of keys) {
        const keyParts = key.split(':');
        const keyService = keyParts[keyParts.length - 2];
        const keyErrorType = keyParts[keyParts.length - 1];
        
        const errors = await redis.lrange(key, 0, limitPerKey - 1);
        
        for (const error of errors) {
          try {
            const errorDetail = JSON.parse(error);
            allErrors.push({
              service: keyService,
              type: keyErrorType,
              timestamp: errorDetail.timestamp,
              message: errorDetail.message
            });
          } catch (e) {
            logger.error(`Failed to parse error detail:`, e);
          }
        }
      }
      
      // Sort by timestamp (newest first)
      return allErrors
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
    } else {
      const key = `${ERROR_DETAIL_KEY}${service}:${errorType}`;
      const errors = await redis.lrange(key, 0, limit - 1);
      
      return errors.map(error => {
        try {
          const errorDetail = JSON.parse(error);
          return {
            service,
            type: errorType,
            timestamp: errorDetail.timestamp,
            message: errorDetail.message
          };
        } catch (e) {
          logger.error(`Failed to parse error detail:`, e);
          return null;
        }
      }).filter(Boolean);
    }
  } catch (error) {
    logger.error(`Failed to get detailed errors:`, error);
    return [];
  }
}

/**
 * Get endpoint usage metrics
 * @param {number} days - Number of days to retrieve
 * @returns {Object} - Endpoint usage metrics
 */
async function getEndpointMetrics(days = 7) {
  try {
    const dateLabels = [];
    const endpoints = new Set();
    const endpointData = {};
    
    // Get metrics for each day
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dateLabels.push(dateStr);
      
      const key = `${ENDPOINT_USAGE_KEY}${dateStr}`;
      const data = await redis.hgetall(key) || {};
      
      // Collect unique endpoints and status codes
      for (const k of Object.keys(data)) {
        if (!k.includes(':')) {
          endpoints.add(k);
          
          if (!endpointData[k]) {
            endpointData[k] = {
              daily: Array(days).fill(0),
              statusCodes: {}
            };
          }
          
          endpointData[k].daily[days - 1 - i] = parseInt(data[k], 10);
        } else {
          const [endpoint, statusCode] = k.split(':');
          
          if (!endpointData[endpoint]) {
            endpoints.add(endpoint);
            endpointData[endpoint] = {
              daily: Array(days).fill(0),
              statusCodes: {}
            };
          }
          
          if (!endpointData[endpoint].statusCodes[statusCode]) {
            endpointData[endpoint].statusCodes[statusCode] = 0;
          }
          
          endpointData[endpoint].statusCodes[statusCode] += parseInt(data[k], 10);
        }
      }
    }
    
    // Calculate totals and prepare result
    const result = [];
    
    for (const endpoint of endpoints) {
      const data = endpointData[endpoint];
      const total = data.daily.reduce((sum, count) => sum + count, 0);
      
      result.push({
        endpoint,
        total,
        daily: data.daily,
        statusCodes: data.statusCodes
      });
    }
    
    return {
      dateLabels,
      endpoints: result.sort((a, b) => b.total - a.total)
    };
  } catch (error) {
    logger.error(`Failed to get endpoint metrics:`, error);
    return {
      dateLabels: [],
      endpoints: []
    };
  }
}

/**
 * Higher-order function to measure and track execution time
 * @param {Function} fn - The function to measure
 * @param {string} operationName - The name of the operation
 * @returns {Function} - Wrapped function with timing
 */
function withTiming(fn, operationName) {
  return async function(...args) {
    const start = performance.now();
    let result;
    
    try {
      result = await fn.apply(this, args);
      const end = performance.now();
      const timeMs = end - start;
      
      // Determine if it's from cache based on function arguments
      // This assumes the last argument might be a 'fromCache' flag
      const fromCache = typeof args[args.length - 1] === 'boolean' ? args[args.length - 1] : false;
      
      // Track response time
      await trackResponseTime(operationName, timeMs, fromCache);
      
      return result;
    } catch (error) {
      // Track error
      await trackError(operationName.split(':')[0], error.name || 'Unknown', error.message);
      throw error;
    }
  };
}

/**
 * Express middleware to track API endpoint usage
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function trackApiUsage(req, res, next) {
  const originalSend = res.send;
  
  res.send = function(body) {
    const endpoint = req.baseUrl + req.route.path;
    trackEndpointUsage(endpoint, res.statusCode);
    return originalSend.apply(res, arguments);
  };
  
  next();
}

module.exports = {
  trackCacheHit,
  trackCacheMiss,
  trackResponseTime,
  trackEndpointUsage,
  trackError,
  updateHitRatio,
  getCacheMetrics,
  getResponseTimeMetrics,
  getErrorMetrics,
  getDetailedErrors,
  getEndpointMetrics,
  withTiming,
  trackApiUsage
}; 