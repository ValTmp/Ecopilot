const Airtable = require('airtable');

// Initialize Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

// Table names
const TABLES = {
  USERS: 'Users',
  ACTIVITIES: 'Activities',
  PRODUCTS: 'Products',
  QUERIES: 'Queries',
  CONSENT_LOGS: 'Consent_Logs',
  DATA_EXPORTS: 'Data_Exports',
  ANALYTICS: 'Analytics'
};

// Field names for each table
const FIELDS = {
  USERS: {
    ID: 'id',
    NAME: 'name',
    EMAIL: 'email',
    POINTS: 'points',
    CREATED_AT: 'created_at',
    UPDATED_AT: 'updated_at'
  },
  ACTIVITIES: {
    ID: 'id',
    USER_ID: 'user_id',
    TYPE: 'type',
    DESCRIPTION: 'description',
    CO2_IMPACT: 'co2_impact',
    DATE: 'date',
    CREATED_AT: 'created_at'
  },
  PRODUCTS: {
    ID: 'id',
    NAME: 'name',
    DESCRIPTION: 'description',
    CATEGORY: 'category',
    AFFILIATE_LINK: 'affiliate_link',
    CO2_SAVINGS: 'co2_savings',
    CREATED_AT: 'created_at'
  },
  QUERIES: {
    ID: 'id',
    USER_ID: 'user_id',
    QUERY: 'query',
    RESPONSE: 'response',
    DATE: 'date',
    CREATED_AT: 'created_at'
  },
  CONSENT_LOGS: {
    ID: 'id',
    USER_ID: 'user_id',
    PREFERENCES: 'preferences',
    TIMESTAMP: 'timestamp',
    CREATED_AT: 'created_at'
  },
  DATA_EXPORTS: {
    ID: 'id',
    USER_ID: 'user_id',
    DATA: 'data',
    STATUS: 'status',
    TIMESTAMP: 'timestamp',
    CREATED_AT: 'created_at'
  },
  ANALYTICS: {
    ID: 'id',
    EVENT_TYPE: 'event_type',
    USER_ID: 'user_id',
    PAYLOAD: 'payload',
    TIMESTAMP: 'timestamp',
    CREATED_AT: 'created_at'
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

module.exports = {
  base,
  TABLES,
  FIELDS,
  CO2_CALC
}; 