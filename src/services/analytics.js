const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const BitlyClient = require('bitly');
const Airtable = require('airtable');
const cache = require('../config/redis');
const logger = require('./logger');

class AnalyticsService {
    constructor() {
        this.analyticsDataClient = new BetaAnalyticsDataClient({
            credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS)
        });
        this.bitly = new BitlyClient(process.env.BITLY_API_KEY);
        this.airtable = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
        this.eventQueue = [];
        this.batchSize = 20;
        this.batchInterval = 60000; // 1 minute
        this.isProcessing = false;
        
        // Start batch processing
        this.startBatchProcessing();
    }

    /**
     * Start the batch processing interval
     */
    startBatchProcessing() {
        setInterval(() => {
            this.processBatch();
        }, this.batchInterval);
    }

    /**
     * Process the event batch
     */
    async processBatch() {
        if (this.isProcessing || this.eventQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const batch = this.eventQueue.splice(0, this.batchSize);
        
        try {
            // Process GA4 events
            await this.processGA4Events(batch);
            
            // Process Airtable events
            await this.processAirtableEvents(batch);
            
            logger.info(`Processed ${batch.length} analytics events`);
        } catch (error) {
            logger.error(`Error processing analytics batch: ${error.message}`);
            // Put events back in queue
            this.eventQueue.unshift(...batch);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process GA4 events
     * @param {Array} events - Events to process
     */
    async processGA4Events(events) {
        // Group events by type for more efficient processing
        const eventGroups = {};
        
        events.forEach(event => {
            if (!eventGroups[event.eventName]) {
                eventGroups[event.eventName] = [];
            }
            eventGroups[event.eventName].push(event);
        });
        
        // Process each event type
        for (const [eventName, eventBatch] of Object.entries(eventGroups)) {
            try {
                // This is a simplified example - actual implementation would depend on GA4 API
                await this.analyticsDataClient.runReport({
                    property: `properties/${process.env.GA4_PROPERTY_ID}`,
                    dimensions: [
                        { name: 'eventName' },
                        { name: 'date' }
                    ],
                    metrics: [
                        { name: 'eventCount' }
                    ],
                    dateRanges: [
                        {
                            startDate: 'today',
                            endDate: 'today'
                        }
                    ]
                });
                
                logger.debug(`Processed ${eventBatch.length} ${eventName} events for GA4`);
            } catch (error) {
                logger.error(`Error processing GA4 events: ${error.message}`);
                throw error;
            }
        }
    }

    /**
     * Process Airtable events
     * @param {Array} events - Events to process
     */
    async processAirtableEvents(events) {
        try {
            // Format events for Airtable
            const records = events.map(event => ({
                fields: {
                    Event_Name: event.eventName,
                    Event_Params: JSON.stringify(event.eventParams),
                    Timestamp: new Date().toISOString()
                }
            }));
            
            // Create records in batches of 10 (Airtable limit)
            for (let i = 0; i < records.length; i += 10) {
                const batch = records.slice(i, i + 10);
                await this.airtable('Analytics_Events').create(batch);
            }
            
            logger.debug(`Processed ${events.length} events for Airtable`);
        } catch (error) {
            logger.error(`Error processing Airtable events: ${error.message}`);
            throw error;
        }
    }

    /**
     * Track an analytics event
     * @param {String} eventName - Event name
     * @param {Object} eventParams - Event parameters
     * @returns {Boolean} Success status
     */
    async trackEvent(eventName, eventParams) {
        try {
            // Add event to queue
            this.eventQueue.push({
                eventName,
                eventParams,
                timestamp: new Date().toISOString()
            });
            
            // Process batch if queue is full
            if (this.eventQueue.length >= this.batchSize) {
                this.processBatch();
            }
            
            return true;
        } catch (error) {
            logger.error(`Error tracking event: ${error.message}`);
            return false;
        }
    }

    /**
     * Shorten a URL using Bitly
     * @param {String} longUrl - Long URL to shorten
     * @returns {Promise<String>} Shortened URL
     */
    async shortenUrl(longUrl) {
        try {
            // Check cache first
            const cacheKey = `short_url:${longUrl}`;
            const cachedUrl = await cache.get(cacheKey);
            
            if (cachedUrl) {
                logger.debug(`Using cached shortened URL for ${longUrl}`);
                return cachedUrl;
            }
            
            const response = await this.bitly.shorten(longUrl);
            const shortUrl = response.link;
            
            // Cache the result for 7 days
            await cache.set(cacheKey, shortUrl, 604800);
            
            return shortUrl;
        } catch (error) {
            logger.error(`Error shortening URL: ${error.message}`);
            return longUrl;
        }
    }

    /**
     * Get analytics report
     * @param {String} startDate - Start date (YYYY-MM-DD)
     * @param {String} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} Analytics report
     */
    async getAnalyticsReport(startDate, endDate) {
        try {
            // Check cache first
            const cacheKey = `analytics_report:${startDate}:${endDate}`;
            const cachedReport = await cache.get(cacheKey);
            
            if (cachedReport) {
                logger.debug(`Using cached analytics report for ${startDate} to ${endDate}`);
                return JSON.parse(cachedReport);
            }
            
            const [response] = await this.analyticsDataClient.runReport({
                property: `properties/${process.env.GA4_PROPERTY_ID}`,
                dimensions: [
                    { name: 'date' },
                    { name: 'eventName' }
                ],
                metrics: [
                    { name: 'eventCount' },
                    { name: 'totalUsers' }
                ],
                dateRanges: [
                    {
                        startDate,
                        endDate
                    }
                ]
            });
            
            // Cache the result for 1 hour
            await cache.set(cacheKey, JSON.stringify(response), 3600);
            
            return response;
        } catch (error) {
            logger.error(`Error getting analytics report: ${error.message}`);
            return null;
        }
    }

    /**
     * Track user activity
     * @param {String} userId - User ID
     * @param {String} activityType - Activity type
     * @param {Object} details - Activity details
     * @returns {Promise<Boolean>} Success status
     */
    async trackUserActivity(userId, activityType, details) {
        try {
            // Add to event queue
            this.eventQueue.push({
                eventName: 'user_activity',
                eventParams: {
                    userId,
                    activityType,
                    ...details
                },
                timestamp: new Date().toISOString()
            });
            
            // Also track directly in Airtable for immediate access
            await this.airtable('User_Activities').create([
                {
                    fields: {
                        User_ID: userId,
                        Activity_Type: activityType,
                        Details: JSON.stringify(details),
                        Timestamp: new Date().toISOString()
                    }
                }
            ]);
            
            return true;
        } catch (error) {
            logger.error(`Error tracking user activity: ${error.message}`);
            return false;
        }
    }

    /**
     * Get top products
     * @param {Number} limit - Number of products to return
     * @returns {Promise<Object>} Top products report
     */
    async getTopProducts(limit = 5) {
        try {
            // Check cache first
            const cacheKey = `top_products:${limit}`;
            const cachedProducts = await cache.get(cacheKey);
            
            if (cachedProducts) {
                logger.debug(`Using cached top products for limit ${limit}`);
                return JSON.parse(cachedProducts);
            }
            
            const [response] = await this.analyticsDataClient.runReport({
                property: `properties/${process.env.GA4_PROPERTY_ID}`,
                dimensions: [
                    { name: 'itemName' }
                ],
                metrics: [
                    { name: 'itemViews' },
                    { name: 'itemPurchases' }
                ],
                dateRanges: [
                    {
                        startDate: '30daysAgo',
                        endDate: 'today'
                    }
                ],
                limit
            });
            
            // Cache the result for 1 hour
            await cache.set(cacheKey, JSON.stringify(response), 3600);
            
            return response;
        } catch (error) {
            logger.error(`Error getting top products: ${error.message}`);
            return null;
        }
    }

    /**
     * Get conversion rate
     * @param {String} startDate - Start date (YYYY-MM-DD)
     * @param {String} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} Conversion rate report
     */
    async getConversionRate(startDate, endDate) {
        try {
            // Check cache first
            const cacheKey = `conversion_rate:${startDate}:${endDate}`;
            const cachedRate = await cache.get(cacheKey);
            
            if (cachedRate) {
                logger.debug(`Using cached conversion rate for ${startDate} to ${endDate}`);
                return JSON.parse(cachedRate);
            }
            
            const [response] = await this.analyticsDataClient.runReport({
                property: `properties/${process.env.GA4_PROPERTY_ID}`,
                metrics: [
                    { name: 'conversions' },
                    { name: 'totalUsers' }
                ],
                dateRanges: [
                    {
                        startDate,
                        endDate
                    }
                ]
            });
            
            // Cache the result for 1 hour
            await cache.set(cacheKey, JSON.stringify(response), 3600);
            
            return response;
        } catch (error) {
            logger.error(`Error getting conversion rate: ${error.message}`);
            return null;
        }
    }
}

module.exports = new AnalyticsService(); 