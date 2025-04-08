/**
 * Landbot Integration
 * Handles the initialization and interaction with the Landbot chat widget
 */

class LandbotIntegration {
  constructor() {
    this.config = null;
    this.initialized = false;
    this.init();
  }

  async init() {
    try {
      // Fetch Landbot configuration from the server
      const response = await fetch('/api/landbot/config');
      this.config = await response.json();
      
      // Load Landbot script
      await this.loadScript();
      
      // Initialize Landbot widget
      this.initializeWidget();
      
      this.initialized = true;
      console.log('Landbot initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Landbot:', error);
    }
  }

  loadScript() {
    return new Promise((resolve, reject) => {
      // Check if script is already loaded
      if (document.querySelector('script[src*="landbot.io"]')) {
        resolve();
        return;
      }

      // Create script element
      const script = document.createElement('script');
      script.src = 'https://static.landbot.io/landbot-widget/landbot-widget-1.0.0.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      
      // Add script to document
      document.head.appendChild(script);
    });
  }

  initializeWidget() {
    // Initialize Landbot widget with configuration
    window.Landbot.init({
      selector: '#landbot-widget',
      token: this.config.token,
      config: {
        welcomeMessage: this.config.welcomeMessage,
        colorScheme: this.config.colorScheme,
        position: this.config.position
      }
    });
  }

  /**
   * Send a message to Landbot
   * @param {String} message - Message to send
   * @returns {Promise<Object>} Response from Landbot
   */
  async sendMessage(message) {
    if (!this.initialized) {
      throw new Error('Landbot is not initialized');
    }

    try {
      const response = await fetch('/api/landbot/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: this.getUserId(),
          message
        })
      });

      return await response.json();
    } catch (error) {
      console.error('Failed to send message to Landbot:', error);
      throw error;
    }
  }

  /**
   * Get chat history for the current user
   * @returns {Promise<Array>} Chat history
   */
  async getChatHistory() {
    if (!this.initialized) {
      throw new Error('Landbot is not initialized');
    }

    try {
      const response = await fetch(`/api/landbot/history/${this.getUserId()}`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      return await response.json();
    } catch (error) {
      console.error('Failed to get chat history from Landbot:', error);
      throw error;
    }
  }

  /**
   * Update user preferences in Landbot
   * @param {Object} preferences - User preferences
   * @returns {Promise<Object>} Updated user data
   */
  async updateUserPreferences(preferences) {
    if (!this.initialized) {
      throw new Error('Landbot is not initialized');
    }

    try {
      const response = await fetch(`/api/landbot/preferences/${this.getUserId()}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({ preferences })
      });

      return await response.json();
    } catch (error) {
      console.error('Failed to update user preferences in Landbot:', error);
      throw error;
    }
  }

  /**
   * Get the current user ID
   * @returns {String} User ID
   */
  getUserId() {
    // This is a placeholder - implement your own user ID retrieval logic
    return localStorage.getItem('userId') || 'anonymous';
  }

  /**
   * Get the authentication token
   * @returns {String} Authentication token
   */
  getAuthToken() {
    // This is a placeholder - implement your own token retrieval logic
    return localStorage.getItem('authToken');
  }
}

// Initialize Landbot when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.landbot = new LandbotIntegration();
}); 