const landbotService = require('../services/landbotService');
const logger = require('../services/logger');
const { ValidationError } = require('../utils/errors');

/**
 * Get Landbot widget configuration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const getWidgetConfig = (req, res, next) => {
  try {
    const config = landbotService.getWidgetConfig();
    res.json(config);
  } catch (error) {
    next(error);
  }
};

/**
 * Send a message to Landbot
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const sendMessage = async (req, res, next) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      throw new ValidationError('User ID and message are required');
    }

    const response = await landbotService.sendMessage(userId, message);
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get chat history for a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const getChatHistory = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    const history = await landbotService.getChatHistory(userId);
    res.json(history);
  } catch (error) {
    next(error);
  }
};

/**
 * Update user preferences in Landbot
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const updateUserPreferences = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { preferences } = req.body;

    if (!userId || !preferences) {
      throw new ValidationError('User ID and preferences are required');
    }

    const response = await landbotService.updateUserPreferences(userId, preferences);
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Handle webhook events from Landbot
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const handleWebhook = async (req, res, next) => {
  try {
    const event = req.body;

    if (!event || !event.type) {
      throw new ValidationError('Invalid webhook event');
    }

    const response = await landbotService.handleWebhook(event);
    res.json(response);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getWidgetConfig,
  sendMessage,
  getChatHistory,
  updateUserPreferences,
  handleWebhook
}; 