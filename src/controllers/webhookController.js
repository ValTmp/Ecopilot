const { executeZapierFlow } = require('../config/zapier');
const EcoMetrics = require('../services/analytics');
const ComplianceService = require('../services/compliance');
const Airtable = require('airtable');
const Redis = require('ioredis');

// Initialize Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base('CO2Calculations');

// Initialize Redis
const redis = new Redis(process.env.REDIS_URL);

class WebhookController {
  static async handleLandbotWebhook(req, res) {
    try {
      const { conversation_id, user_id, input } = req.body;
      
      if (!input) {
        return res.status(400).json({ error: 'Input is required' });
      }
      
      // Execute the Zapier flow for processing user query
      const result = await executeZapierFlow('PROCESS_USER_QUERY', {
        conversation_id,
        user_id: user_id || 'anonymous',
        input,
        timestamp: new Date().toISOString()
      });
      
      // Track the query in analytics
      await EcoMetrics.track('query_submitted', {
        user_id: user_id || 'anonymous',
        query: input,
        timestamp: new Date().toISOString()
      });
      
      return res.json({
        success: true,
        message: 'Query processed successfully',
        flowResult: result
      });
    } catch (error) {
      console.error('Error handling Landbot webhook:', error);
      return res.status(500).json({ error: 'Failed to process query' });
    }
  }
  
  static async handleActivityWebhook(req, res) {
    try {
      const { user_id, activity_type, activity_description, co2_impact, activity_points } = req.body;
      
      if (!user_id || !activity_type || !co2_impact) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Execute the Zapier flow for tracking user activity
      const result = await executeZapierFlow('TRACK_USER_ACTIVITY', {
        user_id,
        activity_type,
        activity_description: activity_description || `${activity_type} activity`,
        co2_impact,
        activity_points: activity_points || Math.round(co2_impact),
        timestamp: new Date().toISOString()
      });
      
      // Track the activity in analytics
      await EcoMetrics.trackUserActivity(user_id, activity_type);
      
      return res.json({
        success: true,
        message: 'Activity tracked successfully',
        flowResult: result
      });
    } catch (error) {
      console.error('Error handling activity webhook:', error);
      return res.status(500).json({ error: 'Failed to track activity' });
    }
  }
  
  static async handleDataExportWebhook(req, res) {
    try {
      const { user_id, user_email } = req.body;
      
      if (!user_id || !user_email) {
        return res.status(400).json({ error: 'User ID and email are required' });
      }
      
      // Get user data
      const userData = await ComplianceService.getUserData(user_id);
      
      // Encrypt the data
      const encryptedData = ComplianceService.encryptData(JSON.stringify(userData));
      
      // Execute the Zapier flow for processing data export
      const result = await executeZapierFlow('PROCESS_DATA_EXPORT', {
        user_id,
        user_email,
        encrypted_data: JSON.stringify(encryptedData),
        timestamp: new Date().toISOString()
      });
      
      return res.json({
        success: true,
        message: 'Data export request processed successfully',
        flowResult: result
      });
    } catch (error) {
      console.error('Error handling data export webhook:', error);
      return res.status(500).json({ error: 'Failed to process data export request' });
    }
  }
}

module.exports = WebhookController; 