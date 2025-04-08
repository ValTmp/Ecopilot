/**
 * EcoPilot - Main JavaScript
 * Handles common functionality for all pages
 */

// Check if user is logged in
document.addEventListener('DOMContentLoaded', function() {
  // Check for authentication token
  const token = localStorage.getItem('authToken');
  
  if (!token) {
    // Redirect to login if not on login page or home page
    const currentPage = window.location.pathname.split('/').pop();
    if (!['', 'index.html', 'login.html', 'register.html'].includes(currentPage)) {
      window.location.href = 'login.html';
    }
  }
  
  // Initialize user menu
  initUserMenu();
  
  // Initialize mobile menu
  initMobileMenu();
});

/**
 * Initialize user menu dropdown
 */
function initUserMenu() {
  const userMenuBtn = document.getElementById('userMenuBtn');
  const userDropdown = document.getElementById('userDropdown');
  const logoutBtn = document.getElementById('logoutBtn');
  
  if (userMenuBtn && userDropdown) {
    // Toggle user dropdown
    userMenuBtn.addEventListener('click', function() {
      userDropdown.classList.toggle('show');
    });
    
    // Close when clicking outside
    document.addEventListener('click', function(event) {
      if (!event.target.closest('.user-menu') && userDropdown.classList.contains('show')) {
        userDropdown.classList.remove('show');
      }
    });
  }
  
  // Handle logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      logout();
    });
  }
}

/**
 * Initialize mobile menu
 */
function initMobileMenu() {
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const mainNav = document.querySelector('.main-nav');
  
  if (mobileMenuToggle && mainNav) {
    mobileMenuToggle.addEventListener('click', function() {
      mainNav.classList.toggle('show');
      this.classList.toggle('active');
    });
  }
}

/**
 * Logout the user
 */
function logout() {
  // Clear local storage
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userData');
  
  // Redirect to login page
  window.location.href = 'login.html';
}

/**
 * Format a date string
 * @param {string} dateString - Date string to format
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Format a number with commas
 * @param {number} number - Number to format
 * @returns {string} Formatted number string
 */
function formatNumber(number) {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Show a toast message
 * @param {string} message - Message to display
 * @param {string} type - Toast type (success, error, warning)
 */
function showToast(message, type = 'success') {
  // Create toast container if it doesn't exist
  let toastContainer = document.querySelector('.toast-container');
  
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Set icon based on type
  let icon = 'info-circle';
  
  switch (type) {
    case 'success':
      icon = 'check-circle';
      break;
    case 'error':
      icon = 'exclamation-circle';
      break;
    case 'warning':
      icon = 'exclamation-triangle';
      break;
  }
  
  toast.innerHTML = `
    <div class="toast-icon">
      <i class="fas fa-${icon}"></i>
    </div>
    <div class="toast-content">
      <p>${message}</p>
    </div>
    <button class="toast-close">&times;</button>
  `;
  
  // Add to container
  toastContainer.appendChild(toast);
  
  // Show toast
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  // Add close button functionality
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  });
  
  // Auto close after 5 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 300);
    }
  }, 5000);
} 