const assert = require('assert');
const { CO2_CALC } = require('../src/config/airtable');
const ComplianceService = require('../src/services/compliance');
const EcoMetrics = require('../src/services/analytics');
const MonetizationService = require('../src/services/monetization');
const gptService = require('../src/services/gptService');
const co2Calculator = require('../src/services/co2Calculator');
const analyticsService = require('../src/services/analyticsService');
const airtableService = require('../src/services/airtableService');
const affiliateService = require('../src/services/affiliateService');
const zapierService = require('../src/services/zapierService');

// Mock external services
jest.mock('../src/services/analyticsService');
jest.mock('../src/services/airtableService');
jest.mock('../src/services/affiliateService');
jest.mock('../src/services/complianceService');
jest.mock('../src/services/zapierService');

// Mock GPT service for testing
const mockGptService = {
  query: async (query) => {
    if (query.includes('plastic')) {
      return {
        tips: [
          'Use reusable bags instead of plastic bags',
          'Avoid single-use plastic containers',
          'Choose products with minimal packaging'
        ],
        product: {
          name: 'Bamboo Utensils Set',
          description: 'Eco-friendly bamboo utensils to replace plastic cutlery',
          affiliateLink: 'https://example.com/bamboo-utensils',
          co2Savings: 2.5
        },
        co2Impact: 3.2
      };
    }
    return {
      tips: ['Tip 1', 'Tip 2', 'Tip 3'],
      product: {
        name: 'Generic Eco Product',
        description: 'An eco-friendly product',
        affiliateLink: 'https://example.com/product',
        co2Savings: 1.0
      },
      co2Impact: 1.5
    };
  }
};

// Test suite for EcoPilot
class TestEcoPilot {
  static async runTests() {
    console.log('Running EcoPilot tests...');
    
    // Test eco responses
    await this.testEcoResponses();
    
    // Test CO2 calculations
    this.testCo2Calculations();
    
    // Test compliance features
    await this.testComplianceFeatures();
    
    // Test analytics
    await this.testAnalytics();
    
    // Test monetization
    await this.testMonetization();
    
    console.log('All tests passed!');
  }
  
  static async testEcoResponses() {
    console.log('Testing eco responses...');
    
    // Test plastic reduction query
    const plasticResponse = await mockGptService.query('How to reduce plastic?');
    assert.strictEqual(plasticResponse.tips.length, 3, 'Should return exactly 3 tips');
    assert.ok(plasticResponse.product.name.includes('Bamboo'), 'Should recommend a bamboo product');
    assert.ok(plasticResponse.co2Impact > 0, 'Should have positive CO2 impact');
    
    // Test generic query
    const genericResponse = await mockGptService.query('How to live sustainably?');
    assert.strictEqual(genericResponse.tips.length, 3, 'Should return exactly 3 tips');
    assert.ok(genericResponse.product.name, 'Should recommend a product');
    assert.ok(genericResponse.co2Impact > 0, 'Should have positive CO2 impact');
    
    console.log('Eco responses tests passed!');
  }
  
  static testCo2Calculations() {
    console.log('Testing CO2 calculations...');
    
    // Test cycling calculation
    const cyclingImpact = CO2_CALC.cycling(10);
    assert.strictEqual(cyclingImpact, 2, 'Cycling 10km should save 2kg CO2');
    
    // Test recycling calculation
    const recyclingImpact = CO2_CALC.recycling(5);
    assert.strictEqual(recyclingImpact, 2.5, 'Recycling 5 items should save 2.5kg CO2');
    
    // Test vegan calculation
    const veganImpact = CO2_CALC.vegan(7);
    assert.strictEqual(veganImpact, 21, 'Vegan for 7 days should save 21kg CO2');
    
    // Test public transport calculation
    const publicTransportImpact = CO2_CALC.publicTransport(20);
    assert.strictEqual(publicTransportImpact, 2, 'Public transport for 20km should save 2kg CO2');
    
    // Test energy saving calculation
    const energySavingImpact = CO2_CALC.energySaving(10);
    assert.strictEqual(energySavingImpact, 5, 'Saving 10kWh should save 5kg CO2');
    
    // Test water saving calculation
    const waterSavingImpact = CO2_CALC.waterSaving(100);
    assert.strictEqual(waterSavingImpact, 10, 'Saving 100L should save 10kg CO2');
    
    console.log('CO2 calculations tests passed!');
  }
  
  static async testComplianceFeatures() {
    console.log('Testing compliance features...');
    
    // Mock user ID
    const userId = 'test-user-123';
    
    // Test cookie consent
    const consent = await ComplianceService.generateCookieConsent(userId);
    assert.ok(consent.hasOwnProperty('consented'), 'Should have consent property');
    assert.ok(consent.hasOwnProperty('timestamp'), 'Should have timestamp property');
    assert.ok(consent.hasOwnProperty('preferences'), 'Should have preferences property');
    
    // Test data export
    const exportResult = await ComplianceService.requestDataExport(userId);
    assert.ok(exportResult.success, 'Data export should be successful');
    
    // Test data encryption
    const testData = { name: 'Test User', email: 'test@example.com' };
    const encryptedData = ComplianceService.encryptData(JSON.stringify(testData));
    assert.ok(encryptedData.hasOwnProperty('iv'), 'Encrypted data should have IV');
    assert.ok(encryptedData.hasOwnProperty('data'), 'Encrypted data should have data');
    
    // Test data decryption
    const decryptedData = ComplianceService.decryptData(encryptedData);
    const parsedData = JSON.parse(decryptedData);
    assert.strictEqual(parsedData.name, 'Test User', 'Decrypted data should match original');
    assert.strictEqual(parsedData.email, 'test@example.com', 'Decrypted data should match original');
    
    console.log('Compliance features tests passed!');
  }
  
  static async testAnalytics() {
    console.log('Testing analytics...');
    
    // Mock user ID
    const userId = 'test-user-123';
    
    // Test tracking user activity
    await EcoMetrics.trackUserActivity(userId, 'test_activity');
    
    // Test tracking product view
    await EcoMetrics.trackProductView('test-product-123', userId);
    
    // Test tracking conversion
    await EcoMetrics.trackConversion(userId, 'test-product-123', 29.99);
    
    // Test generating user report
    const userReport = await EcoMetrics.generateUserReport(userId);
    assert.ok(userReport.hasOwnProperty('userId'), 'User report should have userId');
    assert.ok(userReport.hasOwnProperty('totalCO2Impact'), 'User report should have totalCO2Impact');
    assert.ok(userReport.hasOwnProperty('userPoints'), 'User report should have userPoints');
    
    console.log('Analytics tests passed!');
  }
  
  static async testMonetization() {
    console.log('Testing monetization...');
    
    // Mock user ID
    const userId = 'test-user-123';
    
    // Test getting affiliate products
    const products = await MonetizationService.getAffiliateProducts('sustainability', 3);
    assert.ok(Array.isArray(products), 'Should return an array of products');
    
    // Test tracking product click
    const affiliateLink = await MonetizationService.trackProductClick('test-product-123', userId);
    assert.ok(typeof affiliateLink === 'string', 'Should return an affiliate link');
    
    // Test tracking conversion
    const conversionResult = await MonetizationService.trackConversion('test-product-123', userId, 29.99);
    assert.ok(conversionResult, 'Conversion tracking should be successful');
    
    // Test getting affiliate networks
    const networks = await MonetizationService.getAffiliateNetworks();
    assert.ok(Array.isArray(networks), 'Should return an array of networks');
    assert.ok(networks.length > 0, 'Should have at least one network');
    
    console.log('Monetization tests passed!');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  TestEcoPilot.runTests().catch(error => {
    console.error('Tests failed:', error);
    process.exit(1);
  });
}

module.exports = TestEcoPilot; 