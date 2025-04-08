const express = require('express');
const WebhookController = require('../controllers/webhookController');

const router = express.Router();

// Landbot webhook for processing user queries
router.post('/landbot', WebhookController.handleLandbotWebhook);

// Activity webhook for tracking user activities
router.post('/activity', WebhookController.handleActivityWebhook);

// Data export webhook for processing data export requests
router.post('/data-export', WebhookController.handleDataExportWebhook);

module.exports = router; 