const express = require('express');
const MonetizationController = require('../controllers/monetizationController');

const router = express.Router();

// Get affiliate products
router.get('/products', MonetizationController.getAffiliateProducts);

// Track product click
router.get('/products/:productId/click', MonetizationController.trackProductClick);

// Track conversion
router.post('/conversions', MonetizationController.trackConversion);

// Get affiliate networks
router.get('/networks', MonetizationController.getAffiliateNetworks);

// Add affiliate product (admin only)
router.post('/products', MonetizationController.addAffiliateProduct);

module.exports = router; 