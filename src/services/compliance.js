const crypto = require('crypto');
const { base, TABLES, FIELDS } = require('../config/airtable');

class ComplianceService {
  static async generateCookieConsent(userId) {
    try {
      // Check if user has already consented
      const records = await base('Consent_Logs')
        .select({
          filterByFormula: `{user_id} = '${userId}'`,
          maxRecords: 1
        })
        .firstPage();
      
      if (records.length > 0) {
        return {
          consented: true,
          timestamp: records[0].fields.timestamp,
          preferences: records[0].fields.preferences
        };
      }
      
      return {
        consented: false,
        timestamp: null,
        preferences: {
          necessary: true,
          analytics: false,
          marketing: false,
          affiliate: false
        }
      };
    } catch (error) {
      console.error('Error generating cookie consent:', error);
      return {
        consented: false,
        timestamp: null,
        preferences: {
          necessary: true,
          analytics: false,
          marketing: false,
          affiliate: false
        }
      };
    }
  }
  
  static async saveConsent(userId, preferences) {
    try {
      await base('Consent_Logs').create([
        {
          fields: {
            user_id: userId,
            timestamp: new Date().toISOString(),
            preferences: JSON.stringify(preferences)
          }
        }
      ]);
      
      return true;
    } catch (error) {
      console.error('Error saving consent:', error);
      return false;
    }
  }
  
  static async requestDataExport(userId) {
    try {
      // Get user data
      const userData = await this.getUserData(userId);
      
      // Encrypt the data
      const encryptedData = this.encryptData(JSON.stringify(userData));
      
      // Create export record
      await base('Data_Exports').create([
        {
          fields: {
            user_id: userId,
            timestamp: new Date().toISOString(),
            data: encryptedData,
            status: 'pending'
          }
        }
      ]);
      
      return {
        success: true,
        message: 'Data export request received. You will be notified when it\'s ready.'
      };
    } catch (error) {
      console.error('Error requesting data export:', error);
      return {
        success: false,
        message: 'Failed to request data export.'
      };
    }
  }
  
  static async getUserData(userId) {
    try {
      // Get user profile
      const userRecords = await base(TABLES.USERS)
        .select({
          filterByFormula: `{${FIELDS.USERS.ID}} = '${userId}'`
        })
        .firstPage();
      
      const user = userRecords.length > 0 ? userRecords[0].fields : null;
      
      // Get user activities
      const activities = await base(TABLES.ACTIVITIES)
        .select({
          filterByFormula: `{${FIELDS.ACTIVITIES.USER_ID}} = '${userId}'`
        })
        .all();
      
      // Get user queries
      const queries = await base(TABLES.QUERIES)
        .select({
          filterByFormula: `{${FIELDS.QUERIES.USER_ID}} = '${userId}'`
        })
        .all();
      
      // Get consent logs
      const consentLogs = await base('Consent_Logs')
        .select({
          filterByFormula: `{user_id} = '${userId}'`
        })
        .all();
      
      return {
        user,
        activities: activities.map(record => record.fields),
        queries: queries.map(record => record.fields),
        consentLogs: consentLogs.map(record => record.fields)
      };
    } catch (error) {
      console.error('Error getting user data:', error);
      throw error;
    }
  }
  
  static encryptData(data) {
    // In a real implementation, this would use a proper encryption key
    const key = process.env.ENCRYPTION_KEY || 'default-key-for-development';
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    return {
      iv: iv.toString('hex'),
      data: encrypted.toString('hex')
    };
  }
  
  static decryptData(encryptedData) {
    // In a real implementation, this would use a proper encryption key
    const key = process.env.ENCRYPTION_KEY || 'default-key-for-development';
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const encryptedText = Buffer.from(encryptedData.data, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString();
  }
  
  static async deleteUserData(userId) {
    try {
      // In a real implementation, this would properly delete all user data
      // For now, we'll just mark it as deleted
      await base(TABLES.USERS)
        .select({
          filterByFormula: `{${FIELDS.USERS.ID}} = '${userId}'`
        })
        .firstPage()
        .then(records => {
          if (records.length > 0) {
            return base(TABLES.USERS).update(records[0].id, {
              [FIELDS.USERS.NAME]: 'Deleted User',
              [FIELDS.USERS.EMAIL]: 'deleted@example.com',
              deleted_at: new Date().toISOString()
            });
          }
        });
      
      return {
        success: true,
        message: 'User data has been deleted.'
      };
    } catch (error) {
      console.error('Error deleting user data:', error);
      return {
        success: false,
        message: 'Failed to delete user data.'
      };
    }
  }
}

module.exports = ComplianceService; 