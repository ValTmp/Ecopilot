/**
 * Zapier Flow Configuration
 * 
 * This file defines the Zapier flows for the EcoPilot application.
 * In a real implementation, this would be configured in the Zapier dashboard.
 * For this project, we're simulating the Zapier flows with our own implementation.
 */

// Zapier flow definitions
const ZAPIER_FLOWS = {
  PROCESS_USER_QUERY: {
    name: 'process_user_query',
    trigger: {
      type: 'webhook',
      event: 'landbot.message_received',
      config: {
        url: '/api/webhooks/landbot',
        method: 'POST'
      }
    },
    actions: [
      {
        service: 'openai',
        action: 'create_completion',
        params: {
          model: 'eco-gpt-1.0',
          prompt: 'User asked: {input}\nGenerate eco tips with product from {product_db}',
          max_tokens: 500,
          temperature: 0.7
        }
      },
      {
        service: 'airtable',
        action: 'create_record',
        target: 'Queries',
        fields: {
          user_id: '{user_id}',
          query: '{input}',
          response: '{openai.response}',
          date: '{timestamp}'
        }
      },
      {
        service: 'landbot',
        action: 'send_message',
        params: {
          conversation_id: '{conversation_id}',
          message: '{openai.response}'
        }
      }
    ]
  },
  TRACK_USER_ACTIVITY: {
    name: 'track_user_activity',
    trigger: {
      type: 'webhook',
      event: 'user.activity_completed',
      config: {
        url: '/api/webhooks/activity',
        method: 'POST'
      }
    },
    actions: [
      {
        service: 'airtable',
        action: 'create_record',
        target: 'Activities',
        fields: {
          user_id: '{user_id}',
          type: '{activity_type}',
          description: '{activity_description}',
          co2_impact: '{co2_impact}',
          date: '{timestamp}'
        }
      },
      {
        service: 'airtable',
        action: 'update_record',
        target: 'Users',
        record_id: '{user_id}',
        fields: {
          points: '{current_points} + {activity_points}'
        }
      }
    ]
  },
  PROCESS_DATA_EXPORT: {
    name: 'process_data_export',
    trigger: {
      type: 'webhook',
      event: 'user.data_export_requested',
      config: {
        url: '/api/webhooks/data-export',
        method: 'POST'
      }
    },
    actions: [
      {
        service: 'airtable',
        action: 'create_record',
        target: 'Data_Exports',
        fields: {
          user_id: '{user_id}',
          data: '{encrypted_data}',
          status: 'pending',
          timestamp: '{timestamp}'
        }
      },
      {
        service: 'email',
        action: 'send_email',
        params: {
          to: '{user_email}',
          subject: 'Your EcoPilot Data Export',
          body: 'Your data export request has been received and is being processed. You will receive another email when your data is ready.'
        }
      }
    ]
  }
};

// Helper function to simulate Zapier flow execution
const executeZapierFlow = async (flowName, triggerData) => {
  console.log(`Executing Zapier flow: ${flowName}`);
  
  const flow = ZAPIER_FLOWS[flowName];
  if (!flow) {
    throw new Error(`Flow ${flowName} not found`);
  }
  
  // In a real implementation, this would execute the flow in Zapier
  // For this project, we're just logging the flow execution
  console.log('Trigger data:', triggerData);
  console.log('Flow actions:', flow.actions);
  
  return {
    success: true,
    flowName,
    executedAt: new Date().toISOString()
  };
};

module.exports = {
  ZAPIER_FLOWS,
  executeZapierFlow
}; 