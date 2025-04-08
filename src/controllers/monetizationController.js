const MonetizationService = require('../services/monetization');
const EcoMetrics = require('../services/analytics');

class MonetizationController {
  static async getAffiliateProducts(req, res) {
    try {
      const { category, limit } = req.query;
      const userId = req.user?.id || 'anonymous';
      
      const products = await MonetizationService.getAffiliateProducts(
        category, 
        limit ? parseInt(limit) : 5
      );
      
      // Track product views
      products.forEach(product => {
        EcoMetrics.trackProductView(product.id, userId);
      });
      
      return res.json(products);
    } catch (error) {
      console.error('Error in getAffiliateProducts:', error);
      return res.status(500).json({ error: 'Failed to get affiliate products' });
    }
  }
  
  static async trackProductClick(req, res) {
    try {
      const { productId } = req.params;
      const userId = req.user?.id || 'anonymous';
      
      const affiliateLink = await MonetizationService.trackProductClick(productId, userId);
      
      if (!affiliateLink) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      return res.json({ affiliateLink });
    } catch (error) {
      console.error('Error in trackProductClick:', error);
      return res.status(500).json({ error: 'Failed to track product click' });
    }
  }
  
  static async trackConversion(req, res) {
    try {
      const { productId, amount } = req.body;
      const userId = req.user?.id || 'anonymous';
      
      if (!productId || !amount) {
        return res.status(400).json({ error: 'Product ID and amount are required' });
      }
      
      const success = await MonetizationService.trackConversion(productId, userId, amount);
      
      if (!success) {
        return res.status(500).json({ error: 'Failed to track conversion' });
      }
      
      return res.json({ success: true });
    } catch (error) {
      console.error('Error in trackConversion:', error);
      return res.status(500).json({ error: 'Failed to track conversion' });
    }
  }
  
  static async getAffiliateNetworks(req, res) {
    try {
      const networks = await MonetizationService.getAffiliateNetworks();
      return res.json(networks);
    } catch (error) {
      console.error('Error in getAffiliateNetworks:', error);
      return res.status(500).json({ error: 'Failed to get affiliate networks' });
    }
  }
  
  static async addAffiliateProduct(req, res) {
    try {
      const { name, description, affiliateLink, category, co2Savings } = req.body;
      
      if (!name || !description || !affiliateLink || !category) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const product = await MonetizationService.addAffiliateProduct({
        name,
        description,
        affiliateLink,
        category,
        co2Savings: co2Savings || 0
      });
      
      return res.status(201).json(product);
    } catch (error) {
      console.error('Error in addAffiliateProduct:', error);
      return res.status(500).json({ error: 'Failed to add affiliate product' });
    }
  }
}

module.exports = MonetizationController; 