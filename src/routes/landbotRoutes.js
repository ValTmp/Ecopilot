const express = require('express');
const router = express.Router();
const landbotController = require('../controllers/landbotController');
const { authenticate } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { validateUserInput } = require('../middleware/validation');

// Get Landbot widget configuration
router.get('/config', landbotController.getWidgetConfig);

// Send a message to Landbot
router.post('/message', [
  body('userId').trim().notEmpty().withMessage('User ID is required'),
  body('message').trim().notEmpty().withMessage('Message is required'),
  validateUserInput
], landbotController.sendMessage);

// Get chat history for a user
router.get('/history/:userId', [
  param('userId').trim().notEmpty().withMessage('User ID is required'),
  validateUserInput
], authenticate, landbotController.getChatHistory);

// Update user preferences in Landbot
router.patch('/preferences/:userId', [
  param('userId').trim().notEmpty().withMessage('User ID is required'),
  body('preferences').isObject().withMessage('Preferences must be an object'),
  validateUserInput
], authenticate, landbotController.updateUserPreferences);

// Handle webhook events from Landbot
router.post('/webhook', landbotController.handleWebhook);

module.exports = router; 