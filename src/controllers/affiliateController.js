const affiliateService = require('../services/affiliateService');

class AffiliateController {
    async getProductRecommendations(req, res) {
        try {
            const { category, limit } = req.query;
            const products = await affiliateService.getProductRecommendations(category, parseInt(limit) || 5);
            res.json(products);
        } catch (error) {
            console.error('Error in getProductRecommendations:', error);
            res.status(500).json({ error: 'Failed to get product recommendations' });
        }
    }

    async trackProductView(req, res) {
        try {
            const { productId, userId } = req.body;
            const result = await affiliateService.trackProductView(productId, userId);
            res.json({ success: result });
        } catch (error) {
            console.error('Error in trackProductView:', error);
            res.status(500).json({ error: 'Failed to track product view' });
        }
    }

    async trackProductClick(req, res) {
        try {
            const { productId, userId } = req.body;
            const result = await affiliateService.trackProductClick(productId, userId);
            res.json({ success: result });
        } catch (error) {
            console.error('Error in trackProductClick:', error);
            res.status(500).json({ error: 'Failed to track product click' });
        }
    }

    async trackConversion(req, res) {
        try {
            const { productId, userId, amount } = req.body;
            const result = await affiliateService.trackConversion(productId, userId, amount);
            res.json({ success: result });
        } catch (error) {
            console.error('Error in trackConversion:', error);
            res.status(500).json({ error: 'Failed to track conversion' });
        }
    }

    async getAffiliateLink(req, res) {
        try {
            const { productId, userId } = req.query;
            const link = await affiliateService.getAffiliateLink(productId, userId);
            res.json({ link });
        } catch (error) {
            console.error('Error in getAffiliateLink:', error);
            res.status(500).json({ error: 'Failed to get affiliate link' });
        }
    }
}

module.exports = new AffiliateController(); 