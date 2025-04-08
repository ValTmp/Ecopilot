const Airtable = require('airtable');
const logger = require('../services/logger');

// Initialize Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

// Define table names
const TABLES = {
  USERS: 'Users',
  ACTIVITIES: 'Activities',
  PRODUCTS: 'Products',
  QUERIES: 'Queries',
  CONSENT: 'Consent',
  EXPORTS: 'Exports',
  AFFILIATES: 'Affiliates',
  ANALYTICS: 'Analytics'
};

// Define field names
const FIELDS = {
  USERS: {
    ID: 'User_ID',
    NAME: 'Name',
    EMAIL: 'Email',
    POINTS: 'Points',
    CREATED_AT: 'Created_At',
    LAST_LOGIN: 'Last_Login',
    PREFERENCES: 'Preferences'
  },
  ACTIVITIES: {
    ID: 'Activity_ID',
    USER_ID: 'User_ID',
    TYPE: 'Type',
    VALUE: 'Value',
    CO2_IMPACT: 'CO2_Impact',
    DATE: 'Date',
    DETAILS: 'Details'
  },
  PRODUCTS: {
    ID: 'Product_ID',
    NAME: 'Name',
    DESCRIPTION: 'Description',
    CATEGORY: 'Category',
    PRICE: 'Price',
    AFFILIATE_LINK: 'Affiliate_Link',
    CO2_SAVINGS: 'CO2_Savings',
    IMAGE_URL: 'Image_URL'
  },
  QUERIES: {
    ID: 'Query_ID',
    USER_ID: 'User_ID',
    QUERY: 'Query',
    RESPONSE: 'Response',
    DATE: 'Date',
    PRODUCT_ID: 'Product_ID'
  },
  CONSENT: {
    ID: 'Consent_ID',
    USER_ID: 'User_ID',
    CONSENTED: 'Consented',
    PREFERENCES: 'Preferences',
    DATE: 'Date',
    IP_ADDRESS: 'IP_Address'
  },
  EXPORTS: {
    ID: 'Export_ID',
    USER_ID: 'User_ID',
    STATUS: 'Status',
    REQUEST_DATE: 'Request_Date',
    COMPLETION_DATE: 'Completion_Date',
    FILE_URL: 'File_URL'
  },
  AFFILIATES: {
    ID: 'Affiliate_ID',
    NAME: 'Name',
    COMMISSION: 'Commission',
    API_KEY: 'API_Key',
    API_SECRET: 'API_Secret',
    STATUS: 'Status'
  },
  ANALYTICS: {
    ID: 'Analytics_ID',
    EVENT_TYPE: 'Event_Type',
    USER_ID: 'User_ID',
    PRODUCT_ID: 'Product_ID',
    DATE: 'Date',
    DETAILS: 'Details'
  }
};

// CO2 calculation formulas
const CO2_CALC = {
  cycling: distance => distance * 0.2,
  recycling: items => items * 0.5,
  vegan: days => days * 3,
  publicTransport: distance => distance * 0.1,
  energySaving: kwh => kwh * 0.5,
  waterSaving: liters => liters * 0.1
};

// Database helper functions
const db = {
  /**
   * Create a record in a table
   * @param {String} table - Table name
   * @param {Object} fields - Record fields
   * @returns {Promise<Object>} Created record
   */
  create: async (table, fields) => {
    try {
      const records = await base(table).create([{ fields }]);
      return records[0].fields;
    } catch (error) {
      logger.error(`Error creating record in ${table}: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Get records from a table
   * @param {String} table - Table name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Records
   */
  select: async (table, options = {}) => {
    try {
      const records = await base(table)
        .select(options)
        .firstPage();
      return records.map(record => record.fields);
    } catch (error) {
      logger.error(`Error selecting records from ${table}: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Update a record in a table
   * @param {String} table - Table name
   * @param {String} id - Record ID
   * @param {Object} fields - Updated fields
   * @returns {Promise<Object>} Updated record
   */
  update: async (table, id, fields) => {
    try {
      const record = await base(table).update(id, { fields });
      return record.fields;
    } catch (error) {
      logger.error(`Error updating record in ${table}: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Delete a record from a table
   * @param {String} table - Table name
   * @param {String} id - Record ID
   * @returns {Promise<Boolean>} Success status
   */
  delete: async (table, id) => {
    try {
      await base(table).destroy(id);
      return true;
    } catch (error) {
      logger.error(`Error deleting record from ${table}: ${error.message}`);
      throw error;
    }
  }
};

module.exports = {
  base,
  TABLES,
  FIELDS,
  CO2_CALC,
  db
}; 