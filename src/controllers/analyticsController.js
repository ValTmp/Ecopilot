const analyticsService = require('../services/analytics');

class AnalyticsController {
    async trackEvent(req, res) {
        try {
            const { eventName, eventParams } = req.body;
            const result = await analyticsService.trackEvent(eventName, eventParams);
            res.json({ success: result });
        } catch (error) {
            console.error('Error in trackEvent:', error);
            res.status(500).json({ error: 'Failed to track event' });
        }
    }

    async shortenUrl(req, res) {
        try {
            const { longUrl } = req.body;
            const shortUrl = await analyticsService.shortenUrl(longUrl);
            res.json({ shortUrl });
        } catch (error) {
            console.error('Error in shortenUrl:', error);
            res.status(500).json({ error: 'Failed to shorten URL' });
        }
    }

    async getAnalyticsReport(req, res) {
        try {
            const { startDate, endDate } = req.query;
            const report = await analyticsService.getAnalyticsReport(startDate, endDate);
            res.json(report);
        } catch (error) {
            console.error('Error in getAnalyticsReport:', error);
            res.status(500).json({ error: 'Failed to get analytics report' });
        }
    }

    async trackUserActivity(req, res) {
        try {
            const { userId, activityType, details } = req.body;
            const result = await analyticsService.trackUserActivity(userId, activityType, details);
            res.json({ success: result });
        } catch (error) {
            console.error('Error in trackUserActivity:', error);
            res.status(500).json({ error: 'Failed to track user activity' });
        }
    }

    async getTopProducts(req, res) {
        try {
            const { limit } = req.query;
            const products = await analyticsService.getTopProducts(parseInt(limit) || 5);
            res.json(products);
        } catch (error) {
            console.error('Error in getTopProducts:', error);
            res.status(500).json({ error: 'Failed to get top products' });
        }
    }

    async getConversionRate(req, res) {
        try {
            const { startDate, endDate } = req.query;
            const rate = await analyticsService.getConversionRate(startDate, endDate);
            res.json(rate);
        } catch (error) {
            console.error('Error in getConversionRate:', error);
            res.status(500).json({ error: 'Failed to get conversion rate' });
        }
    }
}

module.exports = new AnalyticsController(); 