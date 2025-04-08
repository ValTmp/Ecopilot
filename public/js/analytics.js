/**
 * EcoPilot Analytics Module
 * Implements the ECO_METRICS tracking system from the roadmap
 */

const ECO_METRICS = {
  /**
   * Track user events and route them to appropriate analytics services
   * @param {string} event - The event name to track
   * @param {Object} payload - Additional data for the event
   */
  track: (event, payload) => {
    // Log event to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ECO_METRICS] Event: ${event}`, payload);
    }

    // Automatic event routing based on event type
    switch (event) {
      case 'tip_viewed':
        // Track tip views in Google Analytics
        if (typeof ga === 'function') {
          ga('send', 'event', 'Engagement', 'TipView', payload.tip_id);
        }
        
        // Track product link clicks with Bitly
        if (payload.product_link && typeof bitly !== 'undefined') {
          bitly.logClick(payload.product_link);
        }
        break;
        
      case 'product_viewed':
        // Track product views
        if (typeof ga === 'function') {
          ga('send', 'event', 'Ecommerce', 'ProductView', payload.product_id);
        }
        break;
        
      case 'product_added_to_cart':
        // Track add to cart events
        if (typeof ga === 'function') {
          ga('send', 'event', 'Ecommerce', 'AddToCart', payload.product_id, {
            value: payload.price,
            currency: payload.currency
          });
        }
        break;
        
      case 'checkout_started':
        // Track checkout initiation
        if (typeof ga === 'function') {
          ga('send', 'event', 'Ecommerce', 'Checkout', payload.cart_id, {
            value: payload.total,
            currency: payload.currency
          });
        }
        break;
        
      case 'purchase_completed':
        // Track completed purchases
        if (typeof ga === 'function') {
          ga('send', 'event', 'Ecommerce', 'Purchase', payload.order_id, {
            value: payload.total,
            currency: payload.currency,
            tax: payload.tax,
            shipping: payload.shipping
          });
        }
        break;
        
      case 'eco_action_completed':
        // Track eco-friendly actions
        if (typeof ga === 'function') {
          ga('send', 'event', 'Ecommerce', 'EcoAction', payload.action_type, {
            value: payload.co2_saved
          });
        }
        break;
        
      case 'user_registered':
        // Track user registrations
        if (typeof ga === 'function') {
          ga('send', 'event', 'User', 'Registration', payload.user_id);
        }
        break;
        
      case 'affiliate_click':
        // Track affiliate link clicks
        if (typeof ga === 'function') {
          ga('send', 'event', 'Affiliate', 'Click', payload.product_id, {
            value: payload.commission
          });
        }
        break;
        
      default:
        // Generic event tracking
        if (typeof ga === 'function') {
          ga('send', 'event', 'Custom', event, JSON.stringify(payload));
        }
    }
    
    // Send event to our backend for server-side tracking
    ECO_METRICS.sendToServer(event, payload);
  },
  
  /**
   * Send event data to our backend for server-side tracking
   * @param {string} event - The event name
   * @param {Object} payload - Event data
   */
  sendToServer: async (event, payload) => {
    try {
      const response = await fetch('/api/analytics/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          event,
          payload,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          screenResolution: `${window.screen.width}x${window.screen.height}`,
          language: navigator.language
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to track event on server');
      }
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  },
  
  /**
   * Initialize analytics tracking
   */
  init: () => {
    // Set up automatic tracking for common events
    
    // Track page views
    if (typeof ga === 'function') {
      ga('send', 'pageview', window.location.pathname);
    }
    
    // Track outbound links
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.href && link.href.startsWith('http') && !link.href.includes(window.location.hostname)) {
        ECO_METRICS.track('outbound_link', {
          url: link.href,
          text: link.textContent
        });
      }
    });
    
    // Track form submissions
    document.addEventListener('submit', (e) => {
      if (e.target.tagName === 'FORM') {
        ECO_METRICS.track('form_submission', {
          form_id: e.target.id || 'unnamed_form',
          form_action: e.target.action
        });
      }
    });
    
    // Track time on page
    let startTime = Date.now();
    window.addEventListener('beforeunload', () => {
      const timeSpent = Math.round((Date.now() - startTime) / 1000);
      ECO_METRICS.track('time_on_page', {
        seconds: timeSpent,
        page: window.location.pathname
      });
    });
    
    console.log('ECO_METRICS initialized');
  }
};

// Initialize analytics when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  ECO_METRICS.init();
});

// Export for use in other modules
window.ECO_METRICS = ECO_METRICS; 