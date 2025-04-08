const express = require('express');
const router = express.Router();
const monitoring = require('../services/monitoring');
const { authenticateUser, authorizeAdmin } = require('../middleware/auth');
const redis = require('../config/redis');

// Middleware to ensure only admins can access monitoring routes
router.use(authenticateUser, authorizeAdmin);

/**
 * @route GET /api/monitoring/cache
 * @desc Get cache performance metrics
 * @access Admin only
 */
router.get('/cache', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7');
    const service = req.query.service || 'all';
    
    // Limit days to prevent excessive data retrieval
    const limitedDays = Math.min(days, 30);
    
    // Get date labels for the period
    const dateLabels = generateDateLabels(limitedDays);
    
    // Get cache metrics for the specified service
    let servicesData = [];
    let cacheHits = [];
    let cacheMisses = [];
    let cachedResponseTimes = [];
    let uncachedResponseTimes = [];
    
    if (service === 'all') {
      // Get metrics for all services
      const services = ['co2:emission_factors', 'user_history'];
      
      for (const svc of services) {
        const metrics = await monitoring.getCacheMetrics(svc, limitedDays);
        servicesData.push({
          name: svc,
          hits: metrics.totalHits,
          misses: metrics.totalMisses,
          hitRate: metrics.hitRatio,
          cachedTime: metrics.avgCachedTime,
          uncachedTime: metrics.avgUncachedTime
        });
        
        // Append daily metrics
        cacheHits.push(...metrics.dailyHits);
        cacheMisses.push(...metrics.dailyMisses);
        cachedResponseTimes.push(...metrics.dailyCachedResponseTimes);
        uncachedResponseTimes.push(...metrics.dailyUncachedResponseTimes);
      }
    } else {
      // Get metrics for specified service
      const metrics = await monitoring.getCacheMetrics(service, limitedDays);
      servicesData.push({
        name: service,
        hits: metrics.totalHits,
        misses: metrics.totalMisses,
        hitRate: metrics.hitRatio,
        cachedTime: metrics.avgCachedTime,
        uncachedTime: metrics.avgUncachedTime
      });
      
      // Use service-specific daily metrics
      cacheHits = metrics.dailyHits;
      cacheMisses = metrics.dailyMisses;
      cachedResponseTimes = metrics.dailyCachedResponseTimes;
      uncachedResponseTimes = metrics.dailyUncachedResponseTimes;
    }
    
    // Get error metrics
    const errors = await monitoring.getErrorMetrics(service === 'all' ? null : service, limitedDays);
    
    // Calculate overall cache hit rate
    const totalHits = servicesData.reduce((sum, service) => sum + service.hits, 0);
    const totalMisses = servicesData.reduce((sum, service) => sum + service.misses, 0);
    const cacheHitRate = totalHits + totalMisses > 0 
      ? (totalHits / (totalHits + totalMisses) * 100).toFixed(1) 
      : 0;
    
    // Calculate average response times
    const avgCachedTime = servicesData.length > 0
      ? (servicesData.reduce((sum, service) => sum + service.cachedTime, 0) / servicesData.length).toFixed(1)
      : 0;
    
    const avgUncachedTime = servicesData.length > 0
      ? (servicesData.reduce((sum, service) => sum + service.uncachedTime, 0) / servicesData.length).toFixed(1)
      : 0;
    
    // Get total requests
    const totalRequests = totalHits + totalMisses;
    
    res.json({
      cacheHitRate,
      avgCachedTime,
      avgUncachedTime,
      totalRequests,
      dateLabels,
      cacheHits,
      cacheMisses,
      cachedResponseTimes,
      uncachedResponseTimes,
      services: servicesData,
      errors
    });
  } catch (error) {
    console.error('Error retrieving cache metrics:', error);
    res.status(500).json({ error: 'Failed to retrieve cache metrics' });
  }
});

/**
 * @route GET /api/monitoring/endpoints
 * @desc Get API endpoint usage metrics
 * @access Admin only
 */
router.get('/endpoints', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7');
    const limitedDays = Math.min(days, 30);
    
    const endpointMetrics = await monitoring.getEndpointMetrics(limitedDays);
    
    res.json(endpointMetrics);
  } catch (error) {
    console.error('Error retrieving endpoint metrics:', error);
    res.status(500).json({ error: 'Failed to retrieve endpoint metrics' });
  }
});

/**
 * @route GET /api/monitoring/errors
 * @desc Get detailed error logs
 * @access Admin only
 */
router.get('/errors', async (req, res) => {
  try {
    const service = req.query.service;
    const errorType = req.query.errorType;
    const limit = parseInt(req.query.limit || '50');
    
    const errors = await monitoring.getDetailedErrors(service, errorType, limit);
    
    res.json(errors);
  } catch (error) {
    console.error('Error retrieving error logs:', error);
    res.status(500).json({ error: 'Failed to retrieve error logs' });
  }
});

/**
 * @route GET /api/monitoring/cache-health
 * @desc Test cache performance and health in real-time
 * @access Admin only
 */
router.get('/cache-health', async (req, res) => {
  try {
    const startTime = process.hrtime();
    const testKey = `cache_health_test:${Date.now()}`;
    const testValue = JSON.stringify({ timestamp: Date.now(), test: 'Cache health check' });
    
    // Step 1: Write to cache
    await redis.set(testKey, testValue, 60); // TTL: 60 seconds
    
    // Step 2: Read from cache
    const cachedValue = await redis.get(testKey);
    
    // Step 3: Delete test key
    await redis.del(testKey);
    
    // Calculate elapsed time
    const elapsed = process.hrtime(startTime);
    const elapsedMs = (elapsed[0] * 1000) + (elapsed[1] / 1000000);
    
    // Check if test was successful
    const success = cachedValue === testValue;
    
    res.json({
      status: success ? 'healthy' : 'degraded',
      responseTime: elapsedMs.toFixed(2),
      timestamp: new Date().toISOString(),
      success,
      message: success ? 'Cache is functioning normally' : 'Cache read/write test failed'
    });
  } catch (error) {
    console.error('Cache health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
      message: 'Cache health check failed'
    });
  }
});

// Helper function to generate date labels for the past n days
function generateDateLabels(days) {
  const labels = [];
  const today = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(today.getDate() - i);
    labels.push(date.toISOString().split('T')[0]);
  }
  
  return labels;
}

module.exports = router; 