const axios = require('axios');
const { ExternalServiceError } = require('../utils/errors');
const logger = require('./logger');
const cache = require('../config/redis');

/**
 * Landbot Service
 * Handles interactions with the Landbot chat widget
 */
class LandbotService {
  constructor() {
    this.baseUrl = process.env.LANDBOT_API_URL || 'https://api.landbot.io/v1';
    this.apiKey = process.env.LANDBOT_API_KEY;
    this.widgetId = process.env.LANDBOT_WIDGET_ID;
    this.sessionPrefix = 'landbot_session:';
    this.csrfPrefix = 'landbot_csrf:';
    
    if (!this.apiKey || !this.widgetId) {
      logger.error('Landbot configuration missing');
      throw new Error('Landbot configuration incomplete');
    }
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Initialize the Landbot widget
   * @param {Object} req - Express Request
   * @param {Object} res - Express Response
   * @returns {Object} Widget-Konfiguration
   */
  async initializeWidget(req, res) {
    try {
      // Generiere CSRF-Token
      const csrfToken = require('crypto').randomBytes(32).toString('hex');
      
      // Speichere CSRF-Token in Redis mit 1-Stunden-TTL
      await cache.set(`${this.csrfPrefix}${req.user.id}`, csrfToken, 3600);
      
      // Setze sichere Cookies
      res.cookie('landbot_session', req.user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 Stunden
      });
      
      res.cookie('landbot_csrf', csrfToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000 // 1 Stunde
      });
      
      // Widget-Konfiguration
      return {
        widgetId: this.widgetId,
        userId: req.user.id,
        userEmail: req.user.email,
        userName: req.user.name,
        csrfToken
      };
    } catch (error) {
      logger.error(`Landbot widget initialization error: ${error.message}`);
      throw new ExternalServiceError('Failed to initialize Landbot widget');
    }
  }

  /**
   * Send a message to Landbot
   * @param {Object} req - Express Request
   * @param {String} message - Nachrichtentext
   * @returns {Object} API-Antwort
   */
  async sendMessage(req, message) {
    try {
      // Validiere CSRF-Token
      const csrfToken = req.cookies.landbot_csrf;
      const storedToken = await cache.get(`${this.csrfPrefix}${req.user.id}`);
      
      if (!csrfToken || !storedToken || csrfToken !== storedToken) {
        throw new ExternalServiceError('Invalid CSRF token');
      }
      
      // Sende Nachricht
      const response = await this.client.post('/messages', {
        widget_id: this.widgetId,
        user_id: req.user.id,
        message: {
          type: 'text',
          content: message
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Landbot message sending error: ${error.message}`);
      throw new ExternalServiceError('Failed to send Landbot message');
    }
  }

  /**
   * Get chat history for a user
   * @param {Object} req - Express Request
   * @returns {Array} Chat-Verlauf
   */
  async getChatHistory(req) {
    try {
      // Validiere CSRF-Token
      const csrfToken = req.cookies.landbot_csrf;
      const storedToken = await cache.get(`${this.csrfPrefix}${req.user.id}`);
      
      if (!csrfToken || !storedToken || csrfToken !== storedToken) {
        throw new ExternalServiceError('Invalid CSRF token');
      }
      
      // Hole Chat-Verlauf
      const response = await this.client.get(`/chats/${req.user.id}/messages`);
      return response.data;
    } catch (error) {
      logger.error(`Landbot chat history error: ${error.message}`);
      throw new ExternalServiceError('Failed to retrieve chat history');
    }
  }

  /**
   * Update user preferences in Landbot
   * @param {Object} req - Express Request
   * @param {Object} preferences - Benutzereinstellungen
   * @returns {Object} Aktualisierte Einstellungen
   */
  async updatePreferences(req, preferences) {
    try {
      // Validiere CSRF-Token
      const csrfToken = req.cookies.landbot_csrf;
      const storedToken = await cache.get(`${this.csrfPrefix}${req.user.id}`);
      
      if (!csrfToken || !storedToken || csrfToken !== storedToken) {
        throw new ExternalServiceError('Invalid CSRF token');
      }
      
      // Aktualisiere Einstellungen
      const response = await this.client.put(`/users/${req.user.id}/preferences`, preferences);
      return response.data;
    } catch (error) {
      logger.error(`Landbot preferences update error: ${error.message}`);
      throw new ExternalServiceError('Failed to update preferences');
    }
  }

  /**
   * End a chat session
   * @param {Object} req - Express Request
   * @param {Object} res - Express Response
   */
  async endSession(req, res) {
    try {
      // Lösche CSRF-Token
      await cache.del(`${this.csrfPrefix}${req.user.id}`);
      
      // Lösche Session-Cookie
      res.clearCookie('landbot_session');
      res.clearCookie('landbot_csrf');
      
      // Beende Chat-Sitzung
      await this.client.post(`/chats/${req.user.id}/end`);
    } catch (error) {
      logger.error(`Landbot session end error: ${error.message}`);
      throw new ExternalServiceError('Failed to end session');
    }
  }

  /**
   * Handle webhook events from Landbot
   * @param {Object} event - Webhook event
   * @returns {Promise<Object>} Processed event
   */
  async handleWebhook(event) {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(event)) {
        throw new ExternalServiceError('Invalid webhook signature');
      }

      // Process different event types
      switch (event.type) {
        case 'message_received':
          return this.handleMessageReceived(event);
        case 'user_started':
          return this.handleUserStarted(event);
        case 'user_finished':
          return this.handleUserFinished(event);
        default:
          logger.warn(`Unhandled Landbot event type: ${event.type}`);
          return { status: 'ignored' };
      }
    } catch (error) {
      logger.error(`Error handling Landbot webhook: ${error.message}`);
      throw new ExternalServiceError('Failed to handle Landbot webhook');
    }
  }

  /**
   * Verify webhook signature
   * @param {Object} event - Webhook event
   * @returns {Boolean} Whether signature is valid
   */
  verifyWebhookSignature(event) {
    // Implementation depends on Landbot's webhook security
    // This is a placeholder for the actual implementation
    return true;
  }

  /**
   * Handle message received event
   * @param {Object} event - Webhook event
   * @returns {Promise<Object>} Processed event
   */
  async handleMessageReceived(event) {
    // Process message received event
    // This would typically involve:
    // 1. Logging the message
    // 2. Triggering any necessary actions
    // 3. Possibly sending a response
    return { status: 'processed', eventType: 'message_received' };
  }

  /**
   * Handle user started event
   * @param {Object} event - Webhook event
   * @returns {Promise<Object>} Processed event
   */
  async handleUserStarted(event) {
    // Process user started event
    // This would typically involve:
    // 1. Creating a new user record if needed
    // 2. Initializing user preferences
    // 3. Sending a welcome message
    return { status: 'processed', eventType: 'user_started' };
  }

  /**
   * Handle user finished event
   * @param {Object} event - Webhook event
   * @returns {Promise<Object>} Processed event
   */
  async handleUserFinished(event) {
    // Process user finished event
    // This would typically involve:
    // 1. Saving the conversation summary
    // 2. Updating user status
    // 3. Possibly sending a follow-up email
    return { status: 'processed', eventType: 'user_finished' };
  }
}

module.exports = new LandbotService(); 