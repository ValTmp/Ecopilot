const Airtable = require('airtable');
const sanitizeHtml = require('sanitize-html');
const xss = require('xss');

class AirtableService {
    constructor() {
        this.base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
    }

    sanitizeInput(input) {
        if (typeof input === 'string') {
            // Remove any potential XSS
            input = xss(input);
            // Sanitize HTML
            input = sanitizeHtml(input);
            // Escape special characters for Airtable formula
            input = input.replace(/'/g, "\\'");
        }
        return input;
    }

    async logQuery(userId, query) {
        try {
            await this.base('User_Queries').create([
                {
                    fields: {
                        User_ID: this.sanitizeInput(userId),
                        Query: this.sanitizeInput(query),
                        Timestamp: new Date().toISOString()
                    }
                }
            ]);
            return true;
        } catch (error) {
            console.error('Error logging query to Airtable:', error);
            return false;
        }
    }

    async logActivity(userId, activityType, details) {
        try {
            await this.base('User_Activities').create([
                {
                    fields: {
                        User_ID: this.sanitizeInput(userId),
                        Activity_Type: this.sanitizeInput(activityType),
                        Details: this.sanitizeInput(JSON.stringify(details)),
                        Timestamp: new Date().toISOString()
                    }
                }
            ]);
            return true;
        } catch (error) {
            console.error('Error logging activity to Airtable:', error);
            return false;
        }
    }

    async getUserProfile(userId) {
        try {
            const sanitizedUserId = this.sanitizeInput(userId);
            const records = await this.base('Users').select({
                filterByFormula: `{User_ID} = '${sanitizedUserId}'`
            }).firstPage();
            
            return records.length > 0 ? records[0].fields : null;
        } catch (error) {
            console.error('Error getting user profile from Airtable:', error);
            return null;
        }
    }

    async updateUserPoints(userId, points) {
        try {
            const sanitizedUserId = this.sanitizeInput(userId);
            const records = await this.base('Users').select({
                filterByFormula: `{User_ID} = '${sanitizedUserId}'`
            }).firstPage();
            
            if (records.length > 0) {
                const currentPoints = records[0].fields.Points || 0;
                await this.base('Users').update(records[0].id, {
                    Points: currentPoints + Math.abs(points) // Ensure points is positive
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error updating user points in Airtable:', error);
            return false;
        }
    }

    async getAffiliateProducts(category, limit = 5) {
        try {
            const sanitizedCategory = this.sanitizeInput(category);
            const records = await this.base('Affiliate_Products').select({
                filterByFormula: `{Category} = '${sanitizedCategory}'`,
                maxRecords: Math.min(Math.abs(limit), 50) // Ensure limit is positive and not too large
            }).firstPage();
            
            return records.map(record => record.fields);
        } catch (error) {
            console.error('Error getting affiliate products from Airtable:', error);
            return [];
        }
    }

    async logConsent(userId, preferences) {
        try {
            await this.base('Consent_Logs').create([
                {
                    fields: {
                        User_ID: this.sanitizeInput(userId),
                        Preferences: this.sanitizeInput(JSON.stringify(preferences)),
                        Timestamp: new Date().toISOString()
                    }
                }
            ]);
            return true;
        } catch (error) {
            console.error('Error logging consent to Airtable:', error);
            return false;
        }
    }

    async requestDataExport(userId) {
        try {
            const userData = await this.getUserData(userId);
            
            await this.base('Data_Exports').create([
                {
                    fields: {
                        User_ID: this.sanitizeInput(userId),
                        Data: this.sanitizeInput(JSON.stringify(userData)),
                        Status: 'pending',
                        Timestamp: new Date().toISOString()
                    }
                }
            ]);
            return true;
        } catch (error) {
            console.error('Error requesting data export from Airtable:', error);
            return false;
        }
    }

    async getUserData(userId) {
        try {
            const sanitizedUserId = this.sanitizeInput(userId);
            
            // Get user profile
            const userProfile = await this.getUserProfile(sanitizedUserId);
            
            // Get user activities
            const activities = await this.base('User_Activities').select({
                filterByFormula: `{User_ID} = '${sanitizedUserId}'`
            }).firstPage();
            
            // Get user queries
            const queries = await this.base('User_Queries').select({
                filterByFormula: `{User_ID} = '${sanitizedUserId}'`
            }).firstPage();
            
            // Get consent logs
            const consentLogs = await this.base('Consent_Logs').select({
                filterByFormula: `{User_ID} = '${sanitizedUserId}'`
            }).firstPage();
            
            return {
                profile: userProfile,
                activities: activities.map(record => record.fields),
                queries: queries.map(record => record.fields),
                consentLogs: consentLogs.map(record => record.fields)
            };
        } catch (error) {
            console.error('Error getting user data from Airtable:', error);
            return null;
        }
    }
}

module.exports = new AirtableService(); 