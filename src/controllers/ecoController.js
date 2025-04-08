const GPTService = require('../services/gptService');
const CO2Calculator = require('../services/co2Calculator');
const EcoMetrics = require('../services/analytics');
const { base, TABLES, FIELDS } = require('../config/airtable');

class EcoController {
  static async getEcoTips(req, res) {
    try {
      const { query } = req.body;
      const userId = req.user?.id || 'anonymous'; // In a real app, this would come from authentication
      
      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }
      
      const response = await GPTService.generateEcoTips(query, userId);
      
      // Track the tip view
      EcoMetrics.track('tip_viewed', {
        tip_id: Date.now().toString(),
        user_id: userId,
        query
      });
      
      return res.json(response);
    } catch (error) {
      console.error('Error in getEcoTips:', error);
      return res.status(500).json({ error: 'Failed to generate eco tips' });
    }
  }
  
  static async logActivity(req, res) {
    try {
      const { type, value } = req.body;
      const userId = req.user?.id || 'anonymous';
      
      if (!type || value === undefined) {
        return res.status(400).json({ error: 'Activity type and value are required' });
      }
      
      // Calculate CO2 impact
      const co2Impact = CO2Calculator.calculateImpact(type, value);
      
      // Log activity in Airtable
      const record = await base(TABLES.ACTIVITIES).create([
        {
          fields: {
            [FIELDS.ACTIVITIES.USER_ID]: userId,
            [FIELDS.ACTIVITIES.TYPE]: type,
            [FIELDS.ACTIVITIES.VALUE]: value,
            [FIELDS.ACTIVITIES.CO2_IMPACT]: co2Impact,
            [FIELDS.ACTIVITIES.DATE]: new Date().toISOString()
          }
        }
      ]);
      
      // Update user points
      await this.updateUserPoints(userId, co2Impact);
      
      // Track the activity
      EcoMetrics.trackUserActivity(userId, { type, value, co2Impact });
      
      return res.json({
        success: true,
        co2Impact,
        record: record[0].fields
      });
    } catch (error) {
      console.error('Error in logActivity:', error);
      return res.status(500).json({ error: 'Failed to log activity' });
    }
  }
  
  static async updateUserPoints(userId, co2Impact) {
    try {
      // Find user record
      const records = await base(TABLES.USERS)
        .select({
          filterByFormula: `{${FIELDS.USERS.ID}} = '${userId}'`
        })
        .firstPage();
      
      if (records.length === 0) {
        // Create new user if not exists
        await base(TABLES.USERS).create([
          {
            fields: {
              [FIELDS.USERS.ID]: userId,
              [FIELDS.USERS.POINTS]: Math.round(co2Impact * 10), // 10 points per CO2 unit
              [FIELDS.USERS.CREATED_AT]: new Date().toISOString()
            }
          }
        ]);
      } else {
        // Update existing user points
        const currentPoints = records[0].fields[FIELDS.USERS.POINTS] || 0;
        await base(TABLES.USERS).update(records[0].id, {
          [FIELDS.USERS.POINTS]: currentPoints + Math.round(co2Impact * 10)
        });
      }
    } catch (error) {
      console.error('Error updating user points:', error);
    }
  }
  
  static async getProductRecommendations(req, res) {
    try {
      const { category } = req.query;
      const userId = req.user?.id || 'anonymous';
      
      let filterFormula = '';
      if (category) {
        filterFormula = `{${FIELDS.PRODUCTS.CATEGORY}} = '${category}'`;
      }
      
      const records = await base(TABLES.PRODUCTS)
        .select({
          filterByFormula: filterFormula,
          maxRecords: 5
        })
        .firstPage();
      
      const products = records.map(record => record.fields);
      
      // Track product views
      products.forEach(product => {
        EcoMetrics.trackProductView(product[FIELDS.PRODUCTS.ID], userId);
      });
      
      return res.json(products);
    } catch (error) {
      console.error('Error in getProductRecommendations:', error);
      return res.status(500).json({ error: 'Failed to get product recommendations' });
    }
  }
}

module.exports = EcoController; 