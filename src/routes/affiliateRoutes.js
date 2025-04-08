const express = require('express');
const router = express.Router();
const affiliateController = require('../controllers/affiliateController');

// Product recommendations
router.get('/products', affiliateController.getProductRecommendations);

// Product tracking
router.post('/track/view', affiliateController.trackProductView);
router.post('/track/click', affiliateController.trackProductClick);
router.post('/track/conversion', affiliateController.trackConversion);

// Affiliate links
router.get('/link', affiliateController.getAffiliateLink);

module.exports = router; 