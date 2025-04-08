const express = require('express');
const EcoController = require('../controllers/ecoController');

const router = express.Router();

// Get eco tips from GPT
router.post('/tips', EcoController.getEcoTips);

// Log user activity
router.post('/activities', EcoController.logActivity);

// Get product recommendations
router.get('/products', EcoController.getProductRecommendations);

module.exports = router; 