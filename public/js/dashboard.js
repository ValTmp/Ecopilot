class Dashboard {
  constructor() {
    this.impactValue = document.querySelector('.impact-value');
    this.unit = document.querySelector('.unit');
    this.progressBar = document.querySelector('.progress');
    this.progressLabel = document.querySelector('.progress-label');
    this.activitiesList = document.querySelector('#activities-list');
    this.tipsContainer = document.querySelector('#tips-container');
    this.productsContainer = document.querySelector('#products-container');
    
    this.init();
  }
  
  async init() {
    try {
      await this.loadUserImpact();
      await this.loadRecentActivities();
      await this.loadEcoTips();
      await this.loadProductRecommendations();
    } catch (error) {
      console.error('Error initializing dashboard:', error);
      this.showError('Failed to load dashboard data. Please try again later.');
    }
  }
  
  async loadUserImpact() {
    try {
      const response = await fetch('/api/impact/user', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load user impact');
      }
      
      const data = await response.json();
      this.updateImpactDisplay(data.totalImpact, data.monthlyGoal);
    } catch (error) {
      console.error('Error loading user impact:', error);
      throw error;
    }
  }
  
  updateImpactDisplay(totalImpact, monthlyGoal) {
    this.impactValue.textContent = totalImpact.toFixed(1);
    this.unit.textContent = 'kg CO2';
    
    const progress = (totalImpact / monthlyGoal) * 100;
    this.progressBar.style.width = `${Math.min(progress, 100)}%`;
    this.progressLabel.textContent = `${progress.toFixed(1)}% of monthly goal`;
  }
  
  async loadRecentActivities() {
    try {
      const response = await fetch('/api/activities/recent', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load recent activities');
      }
      
      const activities = await response.json();
      this.renderActivities(activities);
    } catch (error) {
      console.error('Error loading recent activities:', error);
      throw error;
    }
  }
  
  renderActivities(activities) {
    this.activitiesList.innerHTML = activities.map(activity => `
      <li class="activity-item">
        <div class="activity-icon ${activity.type.toLowerCase()}"></div>
        <div class="activity-details">
          <h3>${activity.title}</h3>
          <p>${activity.description}</p>
          <span class="activity-date">${new Date(activity.date).toLocaleDateString()}</span>
        </div>
        <div class="activity-impact">+${activity.impact} kg CO2</div>
      </li>
    `).join('');
  }
  
  async loadEcoTips() {
    try {
      const response = await fetch('/api/tips', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load eco tips');
      }
      
      const tips = await response.json();
      this.renderTips(tips);
    } catch (error) {
      console.error('Error loading eco tips:', error);
      throw error;
    }
  }
  
  renderTips(tips) {
    this.tipsContainer.innerHTML = tips.map(tip => `
      <div class="tip-card">
        <h3>${tip.title}</h3>
        <p>${tip.description}</p>
        <div class="tip-impact">Potential impact: ${tip.impact} kg CO2</div>
      </div>
    `).join('');
  }
  
  async loadProductRecommendations() {
    try {
      const response = await fetch('/api/products/recommended', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load product recommendations');
      }
      
      const products = await response.json();
      this.renderProducts(products);
    } catch (error) {
      console.error('Error loading product recommendations:', error);
      throw error;
    }
  }
  
  renderProducts(products) {
    this.productsContainer.innerHTML = products.map(product => `
      <div class="product-card">
        <div class="product-image" style="background-image: url('${product.image}')"></div>
        <div class="product-details">
          <h3>${product.name}</h3>
          <p>${product.description}</p>
          <div class="product-impact">Saves ${product.co2Savings} kg CO2</div>
          <a href="/shop/${product.id}" class="btn btn-primary">View Product</a>
        </div>
      </div>
    `).join('');
  }
  
  showError(message) {
    // Create error element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger';
    errorDiv.textContent = message;
    
    // Insert at the top of the dashboard
    const dashboard = document.querySelector('.dashboard-grid');
    dashboard.insertBefore(errorDiv, dashboard.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new Dashboard();
}); 