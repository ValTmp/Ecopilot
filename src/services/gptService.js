const { OpenAI } = require('openai');
const { base, TABLES, FIELDS } = require('../config/airtable');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class GPTService {
  static async generateEcoTips(query, userId) {
    try {
      // Get user's past activities to personalize recommendations
      const userActivities = await this.getUserActivities(userId);
      
      // Create a personalized prompt
      const prompt = this.createPrompt(query, userActivities);
      
      // Generate response from GPT
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are a sustainability advisor. Follow these rules:
            1. Always provide 3 actionable tips
            2. Include 1 relevant eco-friendly product recommendation
            3. Use motivational language
            4. Never make false claims
            5. Base recommendations on user's past activities when available`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });
      
      const response = completion.choices[0].message.content;
      
      // Log the query and response
      await this.logQuery(userId, query, response);
      
      return this.parseResponse(response);
    } catch (error) {
      console.error('Error generating eco tips:', error);
      throw error;
    }
  }
  
  static async getUserActivities(userId) {
    try {
      const records = await base(TABLES.ACTIVITIES)
        .select({
          filterByFormula: `{${FIELDS.ACTIVITIES.USER_ID}} = '${userId}'`,
          sort: [{ field: FIELDS.ACTIVITIES.DATE, direction: 'desc' }],
          maxRecords: 10
        })
        .firstPage();
      
      return records.map(record => record.fields);
    } catch (error) {
      console.error('Error fetching user activities:', error);
      return [];
    }
  }
  
  static createPrompt(query, userActivities) {
    let prompt = `User asked: ${query}\n\n`;
    
    if (userActivities.length > 0) {
      prompt += "User's recent eco-friendly activities:\n";
      userActivities.forEach(activity => {
        prompt += `- ${activity[FIELDS.ACTIVITIES.TYPE]}: ${activity[FIELDS.ACTIVITIES.VALUE]}\n`;
      });
      prompt += "\nPlease provide personalized recommendations based on these activities.\n";
    }
    
    return prompt;
  }
  
  static async logQuery(userId, query, response) {
    try {
      await base(TABLES.QUERIES).create([
        {
          fields: {
            [FIELDS.QUERIES.USER_ID]: userId,
            [FIELDS.QUERIES.QUERY]: query,
            [FIELDS.QUERIES.RESPONSE]: response,
            [FIELDS.QUERIES.DATE]: new Date().toISOString()
          }
        }
      ]);
    } catch (error) {
      console.error('Error logging query:', error);
    }
  }
  
  static parseResponse(response) {
    // Simple parsing - in a real implementation, this would be more robust
    const lines = response.split('\n');
    const tips = [];
    let product = '';
    let co2Impact = 0;
    
    for (const line of lines) {
      if (line.startsWith('- ') || line.startsWith('* ')) {
        tips.push(line.substring(2).trim());
      } else if (line.toLowerCase().includes('product') || line.toLowerCase().includes('recommend')) {
        product = line.trim();
      } else if (line.toLowerCase().includes('co2') || line.toLowerCase().includes('carbon')) {
        const match = line.match(/\d+(\.\d+)?/);
        if (match) {
          co2Impact = parseFloat(match[0]);
        }
      }
    }
    
    return {
      tips: tips.slice(0, 3), // Ensure we only return 3 tips
      product,
      co2Impact
    };
  }
}

module.exports = GPTService; 