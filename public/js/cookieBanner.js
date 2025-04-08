/**
 * Cookie Banner Component
 * Handles GDPR compliance by showing a cookie consent banner
 */

class CookieBanner {
  constructor() {
    this.cookieConsent = localStorage.getItem('cookieConsent');
    this.banner = null;
    this.init();
  }

  init() {
    if (!this.cookieConsent) {
      this.createBanner();
    }
  }

  createBanner() {
    // Create banner element
    this.banner = document.createElement('div');
    this.banner.id = 'cookie-banner';
    this.banner.className = 'cookie-banner';
    this.banner.setAttribute('role', 'alert');
    this.banner.setAttribute('aria-live', 'polite');

    // Banner content
    this.banner.innerHTML = `
      <div class="cookie-content">
        <h3>Cookie Consent</h3>
        <p>We use cookies to enhance your experience, analyze site traffic, and for marketing purposes. 
           By clicking "Accept All", you consent to our use of cookies.</p>
        <div class="cookie-buttons">
          <button id="accept-all" class="btn btn-primary">Accept All</button>
          <button id="accept-essential" class="btn btn-secondary">Essential Only</button>
          <button id="customize" class="btn btn-link">Customize</button>
        </div>
      </div>
    `;

    // Add banner to page
    document.body.appendChild(this.banner);

    // Add event listeners
    document.getElementById('accept-all').addEventListener('click', () => this.acceptAll());
    document.getElementById('accept-essential').addEventListener('click', () => this.acceptEssential());
    document.getElementById('customize').addEventListener('click', () => this.showCustomizeOptions());
  }

  acceptAll() {
    this.saveConsent({
      essential: true,
      analytics: true,
      marketing: true
    });
    this.hideBanner();
  }

  acceptEssential() {
    this.saveConsent({
      essential: true,
      analytics: false,
      marketing: false
    });
    this.hideBanner();
  }

  showCustomizeOptions() {
    // Replace banner content with customization options
    this.banner.innerHTML = `
      <div class="cookie-content">
        <h3>Cookie Preferences</h3>
        <div class="cookie-options">
          <div class="cookie-option">
            <label>
              <input type="checkbox" id="essential-cookies" checked disabled>
              Essential Cookies (Required)
            </label>
            <p>These cookies are necessary for the website to function properly.</p>
          </div>
          <div class="cookie-option">
            <label>
              <input type="checkbox" id="analytics-cookies">
              Analytics Cookies
            </label>
            <p>These cookies help us understand how visitors interact with our website.</p>
          </div>
          <div class="cookie-option">
            <label>
              <input type="checkbox" id="marketing-cookies">
              Marketing Cookies
            </label>
            <p>These cookies are used to track visitors across websites to display relevant advertisements.</p>
          </div>
        </div>
        <div class="cookie-buttons">
          <button id="save-preferences" class="btn btn-primary">Save Preferences</button>
        </div>
      </div>
    `;

    // Add event listener for save button
    document.getElementById('save-preferences').addEventListener('click', () => this.saveCustomPreferences());
  }

  saveCustomPreferences() {
    this.saveConsent({
      essential: true, // Always required
      analytics: document.getElementById('analytics-cookies').checked,
      marketing: document.getElementById('marketing-cookies').checked
    });
    this.hideBanner();
  }

  saveConsent(preferences) {
    localStorage.setItem('cookieConsent', JSON.stringify(preferences));
    this.cookieConsent = preferences;
    
    // Dispatch event for other components to react
    const event = new CustomEvent('cookieConsentUpdated', { detail: preferences });
    document.dispatchEvent(event);
  }

  hideBanner() {
    if (this.banner) {
      this.banner.style.opacity = '0';
      setTimeout(() => {
        this.banner.remove();
        this.banner = null;
      }, 300);
    }
  }
}

// Initialize cookie banner when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.cookieBanner = new CookieBanner();
}); 