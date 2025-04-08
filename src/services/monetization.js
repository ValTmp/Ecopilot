const { base, TABLES, FIELDS } = require('../config/airtable');
const EcoMetrics = require('./analytics');

class MonetizationService {
  static async getAffiliateProducts(category = null, limit = 5) {
    try {
      let filterFormula = '';
      if (category) {
        filterFormula = `{${FIELDS.PRODUCTS.CATEGORY}} = '${category}'`;
      }
      
      const records = await base(TABLES.PRODUCTS)
        .select({
          filterByFormula: filterFormula,
          maxRecords: limit
        })
        .firstPage();
      
      return records.map(record => record.fields);
    } catch (error) {
      console.error('Error fetching affiliate products:', error);
      return [];
    }
  }
  
  static async addAffiliateProduct(product) {
    try {
      const record = await base(TABLES.PRODUCTS).create([
        {
          fields: {
            [FIELDS.PRODUCTS.NAME]: product.name,
            [FIELDS.PRODUCTS.DESCRIPTION]: product.description,
            [FIELDS.PRODUCTS.AFFILIATE_LINK]: product.affiliateLink,
            [FIELDS.PRODUCTS.CATEGORY]: product.category,
            [FIELDS.PRODUCTS.CO2_SAVINGS]: product.co2Savings
          }
        }
      ]);
      
      return record[0].fields;
    } catch (error) {
      console.error('Error adding affiliate product:', error);
      throw error;
    }
  }
  
  static async trackProductClick(productId, userId) {
    try {
      // Track the click
      await EcoMetrics.track('product_click', {
        productId,
        userId,
        timestamp: new Date().toISOString()
      });
      
      // Get the product
      const records = await base(TABLES.PRODUCTS)
        .select({
          filterByFormula: `{${FIELDS.PRODUCTS.ID}} = '${productId}'`
        })
        .firstPage();
      
      if (records.length > 0) {
        const product = records[0].fields;
        return product[FIELDS.PRODUCTS.AFFILIATE_LINK];
      }
      
      return null;
    } catch (error) {
      console.error('Error tracking product click:', error);
      return null;
    }
  }
  
  static async trackConversion(productId, userId, amount) {
    try {
      // Track the conversion
      await EcoMetrics.trackConversion(userId, productId, amount);
      
      // In a real implementation, this would update commission tracking
      console.log(`Conversion tracked: User ${userId} purchased product ${productId} for $${amount}`);
      
      return true;
    } catch (error) {
      console.error('Error tracking conversion:', error);
      return false;
    }
  }
  
  static async getAffiliateNetworks() {
    // In a real implementation, this would fetch from a database or API
    return [
      {
        name: "Amazon Sustainability",
        commission: "8-12%",
        products_api: "https://api.affiliate-sustainability.com/v1"
      },
      {
        name: "Eco-Friendly Marketplace",
        commission: "10-15%",
        products_api: "https://api.eco-marketplace.com/v1"
      },
      {
        name: "Green Products Network",
        commission: "5-10%",
        products_api: "https://api.green-products.com/v1"
      }
    ];
  }
}

module.exports = MonetizationService; 