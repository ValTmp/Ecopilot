const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

// Event tracking
router.post('/track', analyticsController.trackEvent);

// URL shortening
router.post('/shorten', analyticsController.shortenUrl);

// Analytics reports
router.get('/report', analyticsController.getAnalyticsReport);

// User activity tracking
router.post('/activity', analyticsController.trackUserActivity);

// Product analytics
router.get('/products/top', analyticsController.getTopProducts);

// Conversion analytics
router.get('/conversion-rate', analyticsController.getConversionRate);

module.exports = router; 