class Profile {
  constructor() {
    this.userAvatar = document.querySelector('#user-avatar');
    this.changeAvatarBtn = document.querySelector('#change-avatar');
    this.totalPoints = document.querySelector('#total-points');
    this.totalImpact = document.querySelector('#total-impact');
    this.memberSince = document.querySelector('#member-since');
    this.menuItems = document.querySelectorAll('.menu-item');
    this.tabContents = document.querySelectorAll('.tab-content');
    this.accountForm = document.querySelector('#account-form');
    this.preferencesForm = document.querySelector('#preferences-form');
    this.privacyForm = document.querySelector('#privacy-form');
    this.exportDataBtn = document.querySelector('#export-data');
    this.deleteAccountBtn = document.querySelector('#delete-account');
    this.ordersContainer = document.querySelector('#orders-container');
    
    this.init();
  }
  
  async init() {
    try {
      await this.loadUserProfile();
      this.setupEventListeners();
    } catch (error) {
      console.error('Error initializing profile:', error);
      this.showError('Failed to load profile data. Please try again later.');
    }
  }
  
  setupEventListeners() {
    // Tab navigation
    this.menuItems.forEach(item => {
      item.addEventListener('click', () => {
        const tabId = item.getAttribute('data-tab');
        this.switchTab(tabId);
      });
    });
    
    // Form submissions
    this.accountForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.updateAccountSettings();
    });
    
    this.preferencesForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.updatePreferences();
    });
    
    this.privacyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.updatePrivacySettings();
    });
    
    // Avatar change
    this.changeAvatarBtn.addEventListener('click', () => {
      this.changeAvatar();
    });
    
    // Data export and account deletion
    this.exportDataBtn.addEventListener('click', () => {
      this.exportUserData();
    });
    
    this.deleteAccountBtn.addEventListener('click', () => {
      this.confirmDeleteAccount();
    });
  }
  
  switchTab(tabId) {
    // Update active menu item
    this.menuItems.forEach(item => {
      if (item.getAttribute('data-tab') === tabId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    // Show active tab content
    this.tabContents.forEach(content => {
      if (content.id === `${tabId}-tab`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  }
  
  async loadUserProfile() {
    try {
      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load user profile');
      }
      
      const userData = await response.json();
      this.renderUserProfile(userData);
      
      // Load orders if available
      if (userData.hasOrders) {
        this.loadOrders();
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      throw error;
    }
  }
  
  renderUserProfile(userData) {
    // Update avatar
    if (userData.avatar) {
      this.userAvatar.src = userData.avatar;
    }
    
    // Update stats
    this.totalPoints.textContent = userData.points || 0;
    this.totalImpact.textContent = userData.totalImpact || 0;
    this.memberSince.textContent = new Date(userData.createdAt).toLocaleDateString();
    
    // Fill account form
    document.querySelector('#name').value = userData.name || '';
    document.querySelector('#email').value = userData.email || '';
    document.querySelector('#phone').value = userData.phone || '';
    document.querySelector('#location').value = userData.location || '';
    document.querySelector('#bio').value = userData.bio || '';
    
    // Fill preferences form
    document.querySelector('#language').value = userData.language || 'en';
    document.querySelector('#currency').value = userData.currency || 'usd';
    document.querySelector('#units').value = userData.units || 'metric';
    document.querySelector('#email-notifications').checked = userData.emailNotifications !== false;
    document.querySelector('#eco-tips').checked = userData.ecoTips !== false;
    document.querySelector('#product-recommendations').checked = userData.productRecommendations !== false;
    
    // Fill privacy form
    document.querySelector('#profile-visibility').checked = userData.profileVisibility !== false;
    document.querySelector('#activity-sharing').checked = userData.activitySharing !== false;
    document.querySelector('#data-collection').checked = userData.dataCollection !== false;
    document.querySelector('#data-retention').value = userData.dataRetention || '90';
  }
  
  async loadOrders() {
    try {
      const response = await fetch('/api/user/orders', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load orders');
      }
      
      const orders = await response.json();
      this.renderOrders(orders);
    } catch (error) {
      console.error('Error loading orders:', error);
      this.showError('Failed to load order history. Please try again later.');
    }
  }
  
  renderOrders(orders) {
    if (!orders || orders.length === 0) {
      this.ordersContainer.innerHTML = `
        <div class="empty-state">
          <p>You haven't placed any orders yet.</p>
          <a href="/shop" class="btn btn-primary">Start Shopping</a>
        </div>
      `;
      return;
    }
    
    this.ordersContainer.innerHTML = orders.map(order => `
      <div class="order-item">
        <div class="order-image" style="background-image: url('${order.image}')"></div>
        <div class="order-details">
          <h3>${order.productName}</h3>
          <div class="order-meta">
            <span>Order #${order.id}</span>
            <span>${new Date(order.date).toLocaleDateString()}</span>
            <span>$${order.total.toFixed(2)}</span>
          </div>
          <div class="order-status ${order.status.toLowerCase()}">${order.status}</div>
        </div>
        <div class="order-actions">
          <button class="btn btn-secondary" onclick="profile.viewOrderDetails('${order.id}')">View Details</button>
        </div>
      </div>
    `).join('');
  }
  
  async updateAccountSettings() {
    try {
      const formData = new FormData(this.accountForm);
      const userData = Object.fromEntries(formData.entries());
      
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(userData)
      });
      
      if (!response.ok) {
        throw new Error('Failed to update account settings');
      }
      
      this.showSuccess('Account settings updated successfully!');
    } catch (error) {
      console.error('Error updating account settings:', error);
      this.showError('Failed to update account settings. Please try again.');
    }
  }
  
  async updatePreferences() {
    try {
      const formData = new FormData(this.preferencesForm);
      const preferences = Object.fromEntries(formData.entries());
      
      // Convert checkbox values to booleans
      preferences.emailNotifications = formData.get('email-notifications') === 'on';
      preferences.ecoTips = formData.get('eco-tips') === 'on';
      preferences.productRecommendations = formData.get('product-recommendations') === 'on';
      
      const response = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(preferences)
      });
      
      if (!response.ok) {
        throw new Error('Failed to update preferences');
      }
      
      this.showSuccess('Preferences updated successfully!');
    } catch (error) {
      console.error('Error updating preferences:', error);
      this.showError('Failed to update preferences. Please try again.');
    }
  }
  
  async updatePrivacySettings() {
    try {
      const formData = new FormData(this.privacyForm);
      const privacySettings = Object.fromEntries(formData.entries());
      
      // Convert checkbox values to booleans
      privacySettings.profileVisibility = formData.get('profile-visibility') === 'on';
      privacySettings.activitySharing = formData.get('activity-sharing') === 'on';
      privacySettings.dataCollection = formData.get('data-collection') === 'on';
      
      const response = await fetch('/api/user/privacy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(privacySettings)
      });
      
      if (!response.ok) {
        throw new Error('Failed to update privacy settings');
      }
      
      this.showSuccess('Privacy settings updated successfully!');
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      this.showError('Failed to update privacy settings. Please try again.');
    }
  }
  
  changeAvatar() {
    // Create a file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    
    fileInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        
        // Create form data
        const formData = new FormData();
        formData.append('avatar', file);
        
        try {
          const response = await fetch('/api/user/avatar', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
          });
          
          if (!response.ok) {
            throw new Error('Failed to upload avatar');
          }
          
          const data = await response.json();
          this.userAvatar.src = data.avatarUrl;
          this.showSuccess('Avatar updated successfully!');
        } catch (error) {
          console.error('Error uploading avatar:', error);
          this.showError('Failed to upload avatar. Please try again.');
        }
      }
    });
    
    // Trigger file selection
    fileInput.click();
  }
  
  async exportUserData() {
    try {
      const response = await fetch('/api/user/export', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to export user data');
      }
      
      const data = await response.json();
      
      // Create a download link
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecopilot-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showSuccess('Your data has been exported successfully!');
    } catch (error) {
      console.error('Error exporting user data:', error);
      this.showError('Failed to export user data. Please try again.');
    }
  }
  
  confirmDeleteAccount() {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      this.deleteAccount();
    }
  }
  
  async deleteAccount() {
    try {
      const response = await fetch('/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete account');
      }
      
      // Clear local storage and redirect to home page
      localStorage.removeItem('token');
      window.location.href = '/';
    } catch (error) {
      console.error('Error deleting account:', error);
      this.showError('Failed to delete account. Please try again.');
    }
  }
  
  viewOrderDetails(orderId) {
    window.location.href = `/orders/${orderId}`;
  }
  
  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger';
    errorDiv.textContent = message;
    
    const profileContent = document.querySelector('.profile-content');
    profileContent.insertAdjacentElement('afterbegin', errorDiv);
    
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
  
  showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'alert alert-success';
    successDiv.textContent = message;
    
    const profileContent = document.querySelector('.profile-content');
    profileContent.insertAdjacentElement('afterbegin', successDiv);
    
    setTimeout(() => {
      successDiv.remove();
    }, 5000);
  }
}

// Initialize profile when DOM is loaded
let profile;
document.addEventListener('DOMContentLoaded', () => {
  profile = new Profile();
}); 