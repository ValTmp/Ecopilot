/**
 * Real-time Notifications Manager
 * Handles Socket.IO connection and real-time notifications
 */
const NotificationsManager = (function() {
  // Socket.IO instance
  let socket = null;
  
  // Notification sound
  const notificationSound = new Audio('/sounds/notification.mp3');
  
  // Connected state
  let isConnected = false;
  
  // DOM elements
  let notificationDropdown = null;
  let notificationList = null;
  let notificationBadge = null;
  let notificationBtn = null;
  
  /**
   * Initialize notifications
   */
  function initialize() {
    // Get DOM elements
    notificationDropdown = document.getElementById('notificationDropdown');
    notificationList = document.getElementById('notificationList');
    notificationBadge = document.querySelector('.notification-badge');
    notificationBtn = document.getElementById('notificationBtn');
    
    // Initialize Socket.IO
    initializeSocket();
    
    // Add event listeners
    addEventListeners();
    
    // Load initial notifications
    loadNotifications();
  }
  
  /**
   * Initialize Socket.IO connection
   */
  function initializeSocket() {
    try {
      // Get authentication token
      const token = getAuthToken();
      
      if (!token) {
        console.warn('No authentication token found, real-time notifications disabled');
        return;
      }
      
      // Initialize Socket.IO
      socket = io({
        auth: {
          token
        }
      });
      
      // Connection event
      socket.on('connect', () => {
        console.log('Connected to notification service');
        isConnected = true;
        
        // Request badge update
        socket.emit('notification:badge:update');
      });
      
      // Disconnection event
      socket.on('disconnect', () => {
        console.log('Disconnected from notification service');
        isConnected = false;
      });
      
      // Connection error
      socket.on('connect_error', (error) => {
        console.error('Connection error:', error.message);
        isConnected = false;
      });
      
      // New notification
      socket.on('notification:new', (notification) => {
        handleNewNotification(notification);
      });
      
      // Badge update
      socket.on('notification:badge:update', (data) => {
        updateBadge(data.count);
      });
      
      // Error events
      socket.on('error', (error) => {
        console.error('Socket error:', error.message);
      });
    } catch (error) {
      console.error('Failed to initialize Socket.IO:', error.message);
    }
  }
  
  /**
   * Add event listeners
   */
  function addEventListeners() {
    // Toggle notification dropdown
    if (notificationBtn) {
      notificationBtn.addEventListener('click', () => {
        notificationDropdown.classList.toggle('show');
      });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
      if (notificationDropdown && 
          notificationDropdown.classList.contains('show') &&
          !event.target.closest('.notification-wrapper')) {
        notificationDropdown.classList.remove('show');
      }
    });
  }
  
  /**
   * Load notifications
   */
  function loadNotifications() {
    if (!notificationList) return;
    
    notificationList.innerHTML = '<div class="loading">Loading...</div>';
    
    GoalManager.getNotifications(false)
      .then(result => {
        if (result.success && result.data) {
          renderNotifications(result.data);
          updateBadge(result.data.length);
        } else {
          notificationList.innerHTML = '<div class="empty">No notifications</div>';
        }
      })
      .catch(error => {
        console.error('Error loading notifications:', error);
        notificationList.innerHTML = '<div class="error">Failed to load notifications</div>';
      });
  }
  
  /**
   * Render notifications in the dropdown
   * @param {Array} notifications - Notifications to render
   */
  function renderNotifications(notifications) {
    if (!notificationList) return;
    
    notificationList.innerHTML = '';
    
    if (notifications.length === 0) {
      notificationList.innerHTML = '<div class="empty">No new notifications</div>';
      return;
    }
    
    // Only show the 5 most recent notifications
    const recentNotifications = notifications.slice(0, 5);
    
    recentNotifications.forEach(notification => {
      const item = document.createElement('div');
      item.className = 'notification-item';
      item.dataset.id = notification.id;
      
      // Get icon based on notification type
      let icon = 'bell';
      switch (notification.type) {
        case 'goal_completed':
          icon = 'trophy';
          break;
        case 'goal_progress':
          icon = 'chart-line';
          break;
        case 'goal_deadline_approaching':
          icon = 'clock';
          break;
        case 'goal_created':
          icon = 'flag';
          break;
        case 'emissions_increase':
          icon = 'exclamation-triangle';
          break;
        case 'weekly_summary':
          icon = 'calendar-week';
          break;
      }
      
      // Generate title based on type
      let title = 'Notification';
      switch (notification.type) {
        case 'goal_completed':
          title = 'Goal Completed';
          break;
        case 'goal_progress':
          title = 'Goal Progress';
          break;
        case 'goal_deadline_approaching':
          title = 'Deadline Approaching';
          break;
        case 'goal_created':
          title = 'Goal Created';
          break;
        case 'emissions_increase':
          title = 'Emissions Alert';
          break;
        case 'weekly_summary':
          title = 'Weekly Summary';
          break;
      }
      
      // Format date
      const date = new Date(notification.createdAt);
      const timeAgo = getTimeAgo(date);
      
      item.innerHTML = `
        <div class="notification-icon">
          <i class="fas fa-${icon}"></i>
        </div>
        <div class="notification-content">
          <h4>${title}</h4>
          <p>${getNotificationShortContent(notification)}</p>
          <span class="time-ago">${timeAgo}</span>
        </div>
      `;
      
      notificationList.appendChild(item);
      
      // Add click event
      item.addEventListener('click', () => {
        // Mark as read via socket if connected
        if (socket && isConnected) {
          socket.emit('notification:read', { notificationId: notification.id });
        } else {
          // Fall back to REST API
          GoalManager.markNotificationRead(notification.id)
            .then(() => {
              loadNotifications();
            })
            .catch(error => {
              console.error('Error marking notification as read:', error);
            });
        }
        
        // Handle notification click (navigate to relevant page)
        handleNotificationClick(notification);
      });
    });
    
    // Add "View All" link if there are more than 5 notifications
    if (notifications.length > 5) {
      const viewAllItem = document.createElement('div');
      viewAllItem.className = 'notification-view-all';
      viewAllItem.innerHTML = `<a href="/notifications.html">View all (${notifications.length})</a>`;
      notificationList.appendChild(viewAllItem);
    }
  }
  
  /**
   * Handle new notification
   * @param {Object} notification - New notification
   */
  function handleNewNotification(notification) {
    // Play sound
    playNotificationSound();
    
    // Show toast notification
    showToast(notification);
    
    // Reload notifications
    loadNotifications();
  }
  
  /**
   * Update notification badge
   * @param {number} count - Notification count
   */
  function updateBadge(count) {
    if (!notificationBadge) return;
    
    if (count > 0) {
      notificationBadge.textContent = count > 99 ? '99+' : count;
      notificationBadge.style.display = 'block';
    } else {
      notificationBadge.style.display = 'none';
    }
  }
  
  /**
   * Play notification sound
   */
  function playNotificationSound() {
    try {
      notificationSound.play();
    } catch (error) {
      console.warn('Could not play notification sound:', error.message);
    }
  }
  
  /**
   * Show toast notification
   * @param {Object} notification - Notification to show
   */
  function showToast(notification) {
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    
    // Get icon based on notification type
    let icon = 'bell';
    switch (notification.type) {
      case 'goal_completed':
        icon = 'trophy';
        break;
      case 'goal_progress':
        icon = 'chart-line';
        break;
      case 'goal_deadline_approaching':
        icon = 'clock';
        break;
      case 'goal_created':
        icon = 'flag';
        break;
      case 'emissions_increase':
        icon = 'exclamation-triangle';
        break;
      case 'weekly_summary':
        icon = 'calendar-week';
        break;
    }
    
    // Generate title based on type
    let title = 'Notification';
    switch (notification.type) {
      case 'goal_completed':
        title = 'Goal Completed';
        break;
      case 'goal_progress':
        title = 'Goal Progress';
        break;
      case 'goal_deadline_approaching':
        title = 'Deadline Approaching';
        break;
      case 'goal_created':
        title = 'Goal Created';
        break;
      case 'emissions_increase':
        title = 'Emissions Alert';
        break;
      case 'weekly_summary':
        title = 'Weekly Summary';
        break;
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <div class="toast-icon">
        <i class="fas fa-${icon}"></i>
      </div>
      <div class="toast-content">
        <h4>${title}</h4>
        <p>${getNotificationShortContent(notification)}</p>
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
    
    // Add click functionality
    toast.addEventListener('click', (event) => {
      if (!event.target.classList.contains('toast-close')) {
        // Mark as read
        if (socket && isConnected) {
          socket.emit('notification:read', { notificationId: notification.id });
        } else {
          // Fall back to REST API
          GoalManager.markNotificationRead(notification.id)
            .then(() => {
              loadNotifications();
            })
            .catch(error => {
              console.error('Error marking notification as read:', error);
            });
        }
        
        // Handle click
        handleNotificationClick(notification);
        
        // Hide toast
        toast.classList.remove('show');
        setTimeout(() => {
          toast.remove();
        }, 300);
      }
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
  
  /**
   * Get short content for notification
   * @param {Object} notification - Notification
   * @returns {string} Short content
   */
  function getNotificationShortContent(notification) {
    switch (notification.type) {
      case 'goal_completed':
        return `You've completed your goal: "${notification.data.goalDescription || 'CO2 reduction goal'}"`;
      case 'goal_progress':
        return `Progress: ${notification.data.progress || 0}% on "${notification.data.goalDescription || 'CO2 reduction goal'}"`;
      case 'goal_deadline_approaching':
        return `Deadline approaching: ${notification.data.daysRemaining || 'Few'} days left`;
      case 'goal_created':
        return `New goal created: "${notification.data.goalDescription || 'CO2 reduction goal'}"`;
      case 'emissions_increase':
        return `Emissions increased by ${notification.data.increasePercentage || 0}%`;
      case 'weekly_summary':
        return `Weekly CO2: ${notification.data.weeklyTotal || 0} kg (${notification.data.weeklyChange > 0 ? '+' : ''}${notification.data.weeklyChange || 0}%)`;
      default:
        return 'New notification from EcoPilot';
    }
  }
  
  /**
   * Handle notification click
   * @param {Object} notification - Clicked notification
   */
  function handleNotificationClick(notification) {
    // Navigate to relevant page based on notification type
    switch (notification.type) {
      case 'goal_completed':
      case 'goal_progress':
      case 'goal_deadline_approaching':
      case 'goal_created':
        // Navigate to goals page
        window.location.href = '/goals.html';
        break;
      case 'emissions_increase':
        // Navigate to dashboard
        window.location.href = '/dashboard.html';
        break;
      case 'weekly_summary':
        // Navigate to dashboard
        window.location.href = '/dashboard.html';
        break;
      default:
        // Navigate to notifications page
        window.location.href = '/notifications.html';
    }
  }
  
  /**
   * Get time ago string
   * @param {Date} date - Date to format
   * @returns {string} Time ago string
   */
  function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffSec < 60) {
      return 'just now';
    } else if (diffMin < 60) {
      return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    } else if (diffHour < 24) {
      return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    } else if (diffDay < 7) {
      return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString();
    }
  }
  
  /**
   * Mark all notifications as read
   */
  function markAllAsRead() {
    if (socket && isConnected) {
      socket.emit('notification:read:all');
    } else {
      // Fall back to REST API
      GoalManager.markAllNotificationsRead()
        .then(() => {
          loadNotifications();
        })
        .catch(error => {
          console.error('Error marking all notifications as read:', error);
        });
    }
  }
  
  /**
   * Get authentication token
   * @returns {string|null} Authentication token
   */
  function getAuthToken() {
    return localStorage.getItem('authToken');
  }
  
  // Public API
  return {
    initialize,
    loadNotifications,
    markAllAsRead
  };
})();

// Initialize notifications when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  NotificationsManager.initialize();
}); 