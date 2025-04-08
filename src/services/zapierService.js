const axios = require('axios');
const gptService = require('./gptService');
const analyticsService = require('./analyticsService');
const airtableService = require('./airtableService');

class ZapierService {
    constructor() {
        this.webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
    }

    async processUserQuery(query, userId) {
        try {
            // Log the query to Airtable
            await airtableService.logQuery(userId, query);

            // Get response from GPT
            const gptResponse = await gptService.generateResponse(query);

            // Track the event
            await analyticsService.trackEvent('user_query', {
                userId,
                query,
                responseId: gptResponse.id
            });

            // Send to Zapier webhook if configured
            if (this.webhookUrl) {
                await this.sendToZapier({
                    userId,
                    query,
                    response: gptResponse,
                    timestamp: new Date().toISOString()
                });
            }

            return gptResponse;
        } catch (error) {
            console.error('Error processing user query:', error);
            throw error;
        }
    }

    async sendToZapier(data) {
        try {
            await axios.post(this.webhookUrl, data);
            return true;
        } catch (error) {
            console.error('Error sending to Zapier:', error);
            return false;
        }
    }

    async processLandbotMessage(message) {
        try {
            const { userId, text } = message;
            
            // Process the message through GPT
            const response = await this.processUserQuery(text, userId);
            
            // Track the interaction
            await analyticsService.trackUserActivity(userId, 'landbot_interaction', {
                message: text,
                responseId: response.id
            });
            
            return response;
        } catch (error) {
            console.error('Error processing Landbot message:', error);
            throw error;
        }
    }
}

module.exports = new ZapierService(); 