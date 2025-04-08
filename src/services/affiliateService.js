const axios = require('axios');
const airtableService = require('./airtableService');
const analyticsService = require('./analyticsService');

class AffiliateService {
    constructor() {
        this.networks = {
            amazon: {
                apiKey: process.env.AMAZON_AFFILIATE_API_KEY,
                apiUrl: 'https://api.affiliate-sustainability.com/v1',
                commission: '8-12%'
            },
            // Add more affiliate networks as needed
        };
    }

    async getProductRecommendations(category, limit = 5) {
        try {
            // First try to get from Airtable
            const airtableProducts = await airtableService.getAffiliateProducts(category, limit);
            
            if (airtableProducts.length >= limit) {
                return airtableProducts;
            }
            
            // If not enough products in Airtable, fetch from Amazon API
            const amazonProducts = await this.fetchAmazonProducts(category, limit - airtableProducts.length);
            
            // Combine and return
            return [...airtableProducts, ...amazonProducts];
        } catch (error) {
            console.error('Error getting product recommendations:', error);
            return [];
        }
    }

    async fetchAmazonProducts(category, limit = 5) {
        try {
            const response = await axios.get(`${this.networks.amazon.apiUrl}/products`, {
                params: {
                    category,
                    limit,
                    apiKey: this.networks.amazon.apiKey
                }
            });
            
            return response.data.products.map(product => ({
                id: product.id,
                name: product.name,
                description: product.description,
                price: product.price,
                url: product.affiliateUrl,
                image: product.image,
                category: product.category,
                eco_rating: product.ecoRating,
                co2_savings: product.co2Savings
            }));
        } catch (error) {
            console.error('Error fetching Amazon products:', error);
            return [];
        }
    }

    async trackProductView(productId, userId) {
        try {
            // Track in analytics
            await analyticsService.trackEvent('product_view', {
                productId,
                userId,
                timestamp: new Date().toISOString()
            });
            
            // Log activity
            await airtableService.logActivity(userId, 'product_view', {
                productId,
                timestamp: new Date().toISOString()
            });
            
            return true;
        } catch (error) {
            console.error('Error tracking product view:', error);
            return false;
        }
    }

    async trackProductClick(productId, userId) {
        try {
            // Track in analytics
            await analyticsService.trackEvent('product_click', {
                productId,
                userId,
                timestamp: new Date().toISOString()
            });
            
            // Log activity
            await airtableService.logActivity(userId, 'product_click', {
                productId,
                timestamp: new Date().toISOString()
            });
            
            return true;
        } catch (error) {
            console.error('Error tracking product click:', error);
            return false;
        }
    }

    async trackConversion(productId, userId, amount) {
        try {
            // Track in analytics
            await analyticsService.trackEvent('conversion', {
                productId,
                userId,
                amount,
                timestamp: new Date().toISOString()
            });
            
            // Log activity
            await airtableService.logActivity(userId, 'conversion', {
                productId,
                amount,
                timestamp: new Date().toISOString()
            });
            
            // Update user points (1 point per dollar spent)
            await airtableService.updateUserPoints(userId, Math.floor(amount));
            
            return true;
        } catch (error) {
            console.error('Error tracking conversion:', error);
            return false;
        }
    }

    async getAffiliateLink(productId, userId) {
        try {
            // Get product from Airtable
            const records = await airtableService.base('Affiliate_Products').select({
                filterByFormula: `{Product_ID} = '${productId}'`
            }).firstPage();
            
            if (records.length > 0) {
                const product = records[0].fields;
                
                // Track the link generation
                await this.trackProductClick(productId, userId);
                
                // Return the affiliate URL
                return product.Affiliate_URL;
            }
            
            return null;
        } catch (error) {
            console.error('Error getting affiliate link:', error);
            return null;
        }
    }
}

module.exports = new AffiliateService(); 