class PrivacyManager {
  constructor() {
    this.consentBanner = document.getElementById('consent-banner');
    this.consentForm = document.getElementById('consent-form');
    this.dataExportBtn = document.getElementById('data-export-btn');
    this.deleteDataBtn = document.getElementById('delete-data-btn');
    
    this.initializeEventListeners();
    this.checkConsentStatus();
  }

  initializeEventListeners() {
    if (this.consentForm) {
      this.consentForm.addEventListener('submit', (e) => this.handleConsentSubmit(e));
    }
    
    if (this.dataExportBtn) {
      this.dataExportBtn.addEventListener('click', () => this.requestDataExport());
    }
    
    if (this.deleteDataBtn) {
      this.deleteDataBtn.addEventListener('click', () => this.handleDataDeletion());
    }
  }

  async checkConsentStatus() {
    try {
      const response = await fetch('/api/compliance/cookie-consent');
      const data = await response.json();
      
      if (!data.consent) {
        this.showConsentBanner();
      }
    } catch (error) {
      console.error('Error checking consent status:', error);
    }
  }

  showConsentBanner() {
    if (this.consentBanner) {
      this.consentBanner.style.display = 'block';
    }
  }

  async handleConsentSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(this.consentForm);
    const preferences = {
      analytics: formData.get('analytics') === 'on',
      marketing: formData.get('marketing') === 'on',
      necessary: true // Always required
    };

    try {
      const response = await fetch('/api/compliance/cookie-consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(preferences)
      });

      if (response.ok) {
        this.consentBanner.style.display = 'none';
        // Reload page to apply new consent settings
        window.location.reload();
      }
    } catch (error) {
      console.error('Error saving consent:', error);
    }
  }

  async requestDataExport() {
    try {
      const response = await fetch('/api/compliance/data-export', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert('Your data export request has been submitted. You will receive an email with your data shortly.');
      } else {
        alert('Error requesting data export: ' + data.error);
      }
    } catch (error) {
      console.error('Error requesting data export:', error);
      alert('An error occurred while requesting your data export.');
    }
  }

  async handleDataDeletion() {
    if (!confirm('Are you sure you want to delete your data? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/compliance/user-data', {
        method: 'DELETE'
      });
      
      if (response.ok) {
        alert('Your data has been successfully deleted.');
        window.location.href = '/';
      } else {
        const data = await response.json();
        alert('Error deleting data: ' + data.error);
      }
    } catch (error) {
      console.error('Error deleting data:', error);
      alert('An error occurred while deleting your data.');
    }
  }
}

// Initialize privacy manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PrivacyManager();
}); 