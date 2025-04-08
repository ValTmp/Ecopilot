/**
 * Goal Manager - Handles CO2 reduction goals in the frontend
 */
const GoalManager = (function() {
  // Constants
  const API_URL = '/api/goals';
  const NOTIFICATION_API_URL = '/api/notifications';
  
  // Goal type labels for UI
  const GOAL_TYPE_LABELS = {
    'transport_reduction': 'Transport Emissions Reduction',
    'overall_reduction': 'Overall CO2 Reduction',
    'custom': 'Custom Goal'
  };
  
  // Status labels for UI
  const STATUS_LABELS = {
    'in_progress': 'In Progress',
    'completed': 'Completed',
    'failed': 'Failed',
    'cancelled': 'Cancelled'
  };
  
  // Status colors for UI
  const STATUS_COLORS = {
    'in_progress': 'blue',
    'completed': 'green',
    'failed': 'red',
    'cancelled': 'gray'
  };
  
  /**
   * Create a new goal
   * @param {Object} goalData - Goal data
   * @returns {Promise} - Promise with created goal
   */
  async function createGoal(goalData) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify(goalData)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create goal');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error creating goal:', error);
      throw error;
    }
  }
  
  /**
   * Get all goals for the user
   * @returns {Promise} - Promise with user goals
   */
  async function getGoals() {
    try {
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to retrieve goals');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error retrieving goals:', error);
      throw error;
    }
  }
  
  /**
   * Get a specific goal by ID
   * @param {string} goalId - Goal ID
   * @returns {Promise} - Promise with goal data
   */
  async function getGoalById(goalId) {
    try {
      const response = await fetch(`${API_URL}/${goalId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to retrieve goal');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error retrieving goal:', error);
      throw error;
    }
  }
  
  /**
   * Update progress for a custom goal
   * @param {string} goalId - Goal ID
   * @param {number} progress - Progress percentage (0-100)
   * @returns {Promise} - Promise with updated goal
   */
  async function updateCustomGoalProgress(goalId, progress) {
    try {
      const response = await fetch(`${API_URL}/${goalId}/progress`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ progress })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update goal progress');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error updating goal progress:', error);
      throw error;
    }
  }
  
  /**
   * Cancel a goal
   * @param {string} goalId - Goal ID
   * @returns {Promise} - Promise with result
   */
  async function cancelGoal(goalId) {
    try {
      const response = await fetch(`${API_URL}/${goalId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to cancel goal');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error cancelling goal:', error);
      throw error;
    }
  }
  
  /**
   * Get goal statistics for the user
   * @returns {Promise} - Promise with goal statistics
   */
  async function getGoalStats() {
    try {
      const response = await fetch(`${API_URL}/stats/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to retrieve goal statistics');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error retrieving goal statistics:', error);
      throw error;
    }
  }
  
  /**
   * Get user notifications
   * @param {boolean} includeRead - Whether to include read notifications
   * @returns {Promise} - Promise with notifications
   */
  async function getNotifications(includeRead = false) {
    try {
      const url = new URL(NOTIFICATION_API_URL, window.location.origin);
      
      if (includeRead) {
        url.searchParams.append('includeRead', 'true');
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to retrieve notifications');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error retrieving notifications:', error);
      throw error;
    }
  }
  
  /**
   * Mark a notification as read
   * @param {string} notificationId - Notification ID
   * @returns {Promise} - Promise with updated notification
   */
  async function markNotificationRead(notificationId) {
    try {
      const response = await fetch(`${NOTIFICATION_API_URL}/${notificationId}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to mark notification as read');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }
  
  /**
   * Mark all notifications as read
   * @returns {Promise} - Promise with result
   */
  async function markAllNotificationsRead() {
    try {
      const response = await fetch(`${NOTIFICATION_API_URL}/mark-all-read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to mark all notifications as read');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }
  
  /**
   * Render a goal card in the UI
   * @param {Object} goal - Goal data
   * @param {HTMLElement} container - Container element
   */
  function renderGoalCard(goal, container) {
    const card = document.createElement('div');
    card.className = 'goal-card';
    card.dataset.goalId = goal.id;
    
    // Calculate days remaining
    const today = new Date();
    const deadline = new Date(goal.deadline);
    const daysRemaining = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
    
    card.innerHTML = `
      <div class="goal-header">
        <span class="goal-type">${GOAL_TYPE_LABELS[goal.type] || goal.type}</span>
        <span class="goal-status" style="color: ${STATUS_COLORS[goal.status] || 'gray'}">
          ${STATUS_LABELS[goal.status] || goal.status}
        </span>
      </div>
      <h3 class="goal-title">${goal.description}</h3>
      <div class="goal-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${goal.progress}%"></div>
        </div>
        <span class="progress-text">${Math.round(goal.progress)}% complete</span>
      </div>
      <div class="goal-details">
        <p><strong>Target:</strong> ${goal.target}% reduction</p>
        <p><strong>Deadline:</strong> ${new Date(goal.deadline).toLocaleDateString()}</p>
        ${goal.status === 'in_progress' ? `<p><strong>Days remaining:</strong> ${daysRemaining}</p>` : ''}
        ${goal.status === 'completed' ? `<p><strong>Completed on:</strong> ${new Date(goal.completedAt).toLocaleDateString()}</p>` : ''}
      </div>
      <div class="goal-actions">
        ${goal.status === 'in_progress' && goal.type === 'custom' ? 
          `<button class="btn btn-primary update-progress-btn">Update Progress</button>` : ''}
        ${goal.status === 'in_progress' ? 
          `<button class="btn btn-danger cancel-goal-btn">Cancel Goal</button>` : ''}
      </div>
    `;
    
    container.appendChild(card);
    
    // Add event listeners
    if (goal.status === 'in_progress' && goal.type === 'custom') {
      card.querySelector('.update-progress-btn').addEventListener('click', () => {
        openUpdateProgressModal(goal);
      });
    }
    
    if (goal.status === 'in_progress') {
      card.querySelector('.cancel-goal-btn').addEventListener('click', () => {
        confirmCancelGoal(goal);
      });
    }
  }
  
  /**
   * Render goal statistics
   * @param {Object} stats - Goal statistics
   * @param {HTMLElement} container - Container element
   */
  function renderGoalStats(stats, container) {
    container.innerHTML = `
      <div class="stats-overview">
        <div class="stat-card">
          <h4>Total Goals</h4>
          <p class="stat-value">${stats.totalGoals}</p>
        </div>
        <div class="stat-card">
          <h4>Completed</h4>
          <p class="stat-value">${stats.completedGoals}</p>
        </div>
        <div class="stat-card">
          <h4>In Progress</h4>
          <p class="stat-value">${stats.inProgressGoals}</p>
        </div>
        <div class="stat-card">
          <h4>Completion Rate</h4>
          <p class="stat-value">${stats.completionRate}%</p>
        </div>
      </div>
      <div class="stats-chart">
        <canvas id="goals-chart"></canvas>
      </div>
    `;
    
    // Initialize chart (if Chart.js is loaded)
    if (window.Chart) {
      const ctx = document.getElementById('goals-chart').getContext('2d');
      new Chart(ctx, {
        type: 'pie',
        data: {
          labels: ['Completed', 'In Progress', 'Failed', 'Cancelled'],
          datasets: [{
            data: [
              stats.completedGoals, 
              stats.inProgressGoals, 
              stats.failedGoals, 
              stats.cancelledGoals
            ],
            backgroundColor: [
              '#4CAF50', // Green for completed
              '#2196F3', // Blue for in progress
              '#F44336', // Red for failed
              '#9E9E9E'  // Gray for cancelled
            ]
          }]
        },
        options: {
          responsive: true,
          legend: {
            position: 'bottom'
          }
        }
      });
    }
  }
  
  /**
   * Open modal to update custom goal progress
   * @param {Object} goal - Goal data
   */
  function openUpdateProgressModal(goal) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('update-progress-modal');
    
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'update-progress-modal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <span class="close">&times;</span>
          <h2>Update Goal Progress</h2>
          <form id="update-progress-form">
            <input type="hidden" id="goal-id">
            <div class="form-group">
              <label for="progress-input">Progress (%):</label>
              <input type="range" id="progress-input" min="0" max="100" step="1" class="progress-slider">
              <span id="progress-value">0%</span>
            </div>
            <button type="submit" class="btn btn-primary">Save</button>
          </form>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // Close button functionality
      modal.querySelector('.close').addEventListener('click', () => {
        modal.style.display = 'none';
      });
      
      // Update progress value display
      const progressInput = modal.querySelector('#progress-input');
      const progressValue = modal.querySelector('#progress-value');
      
      progressInput.addEventListener('input', () => {
        progressValue.textContent = `${progressInput.value}%`;
      });
      
      // Form submission
      const form = modal.querySelector('#update-progress-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const goalId = form.querySelector('#goal-id').value;
        const progress = parseInt(form.querySelector('#progress-input').value);
        
        try {
          const result = await updateCustomGoalProgress(goalId, progress);
          
          if (result.success) {
            showToast('Goal progress updated successfully');
            modal.style.display = 'none';
            
            // Refresh the UI
            const goalsContainer = document.querySelector('#goals-container');
            if (goalsContainer) {
              loadAndDisplayGoals(goalsContainer);
            }
          }
        } catch (error) {
          showToast(`Error: ${error.message}`, 'error');
        }
      });
    }
    
    // Set values for current goal
    modal.querySelector('#goal-id').value = goal.id;
    const progressInput = modal.querySelector('#progress-input');
    progressInput.value = goal.progress;
    modal.querySelector('#progress-value').textContent = `${Math.round(goal.progress)}%`;
    
    // Show modal
    modal.style.display = 'block';
  }
  
  /**
   * Confirm and cancel a goal
   * @param {Object} goal - Goal data
   */
  function confirmCancelGoal(goal) {
    if (confirm(`Are you sure you want to cancel the goal "${goal.description}"?`)) {
      cancelGoal(goal.id)
        .then(result => {
          if (result.success) {
            showToast('Goal cancelled successfully');
            
            // Refresh the UI
            const goalsContainer = document.querySelector('#goals-container');
            if (goalsContainer) {
              loadAndDisplayGoals(goalsContainer);
            }
          }
        })
        .catch(error => {
          showToast(`Error: ${error.message}`, 'error');
        });
    }
  }
  
  /**
   * Load and display goals in container
   * @param {HTMLElement} container - Container element
   */
  function loadAndDisplayGoals(container) {
    container.innerHTML = '<div class="loading">Loading goals...</div>';
    
    getGoals()
      .then(result => {
        if (result.success && result.data) {
          container.innerHTML = '';
          
          if (result.data.length === 0) {
            container.innerHTML = '<p class="no-goals">You don\'t have any goals yet. Create one to start tracking your CO2 reduction!</p>';
            return;
          }
          
          result.data.forEach(goal => {
            renderGoalCard(goal, container);
          });
        } else {
          container.innerHTML = '<p class="error">Failed to load goals</p>';
        }
      })
      .catch(error => {
        container.innerHTML = `<p class="error">Error: ${error.message}</p>`;
      });
  }
  
  /**
   * Load and display goal statistics
   * @param {HTMLElement} container - Container element
   */
  function loadAndDisplayGoalStats(container) {
    container.innerHTML = '<div class="loading">Loading statistics...</div>';
    
    getGoalStats()
      .then(result => {
        if (result.success && result.data) {
          renderGoalStats(result.data, container);
        } else {
          container.innerHTML = '<p class="error">Failed to load goal statistics</p>';
        }
      })
      .catch(error => {
        container.innerHTML = `<p class="error">Error: ${error.message}</p>`;
      });
  }
  
  /**
   * Load and display notifications in container
   * @param {HTMLElement} container - Container element
   * @param {boolean} includeRead - Whether to include read notifications
   */
  function loadAndDisplayNotifications(container, includeRead = false) {
    container.innerHTML = '<div class="loading">Loading notifications...</div>';
    
    getNotifications(includeRead)
      .then(result => {
        if (result.success && result.data) {
          container.innerHTML = '';
          
          if (result.data.length === 0) {
            container.innerHTML = '<p class="no-notifications">You don\'t have any notifications</p>';
            return;
          }
          
          // Add "Mark All Read" button if there are unread notifications
          if (result.data.some(n => !n.readAt)) {
            const markAllBtn = document.createElement('button');
            markAllBtn.className = 'btn btn-secondary mark-all-read-btn';
            markAllBtn.textContent = 'Mark All as Read';
            markAllBtn.addEventListener('click', () => {
              markAllNotificationsRead()
                .then(() => {
                  loadAndDisplayNotifications(container, includeRead);
                  updateNotificationBadge();
                })
                .catch(error => {
                  showToast(`Error: ${error.message}`, 'error');
                });
            });
            
            container.appendChild(markAllBtn);
          }
          
          // Create notifications list
          const list = document.createElement('div');
          list.className = 'notifications-list';
          container.appendChild(list);
          
          result.data.forEach(notification => {
            renderNotification(notification, list);
          });
        } else {
          container.innerHTML = '<p class="error">Failed to load notifications</p>';
        }
      })
      .catch(error => {
        container.innerHTML = `<p class="error">Error: ${error.message}</p>`;
      });
  }
  
  /**
   * Render a notification in the UI
   * @param {Object} notification - Notification data
   * @param {HTMLElement} container - Container element
   */
  function renderNotification(notification, container) {
    const item = document.createElement('div');
    item.className = `notification-item ${notification.readAt ? 'read' : 'unread'}`;
    item.dataset.id = notification.id;
    
    // Format the date
    const date = new Date(notification.createdAt);
    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    
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
    
    // Generate notification title
    let title = 'Notification';
    switch (notification.type) {
      case 'goal_completed':
        title = 'Goal Completed';
        break;
      case 'goal_progress':
        title = 'Goal Progress Update';
        break;
      case 'goal_deadline_approaching':
        title = 'Goal Deadline Approaching';
        break;
      case 'goal_created':
        title = 'New Goal Created';
        break;
      case 'emissions_increase':
        title = 'Emissions Increase Detected';
        break;
      case 'weekly_summary':
        title = 'Weekly Emissions Summary';
        break;
    }
    
    // Generate notification content based on type and data
    let content = '';
    
    switch (notification.type) {
      case 'goal_completed':
        content = `Congratulations! You've completed your goal: "${notification.data.goalDescription || 'CO2 reduction goal'}"`;
        break;
      case 'goal_progress':
        content = `You've made progress on your goal: "${notification.data.goalDescription || 'CO2 reduction goal'}". Current progress: ${notification.data.progress || 0}%`;
        break;
      case 'goal_deadline_approaching':
        content = `The deadline for your goal "${notification.data.goalDescription || 'CO2 reduction goal'}" is approaching. ${notification.data.daysRemaining || 'Few'} days remaining.`;
        break;
      case 'goal_created':
        content = `You've created a new goal: "${notification.data.goalDescription || 'CO2 reduction goal'}" with target ${notification.data.target || 0}%`;
        break;
      case 'emissions_increase':
        content = `We've detected an increase of ${notification.data.increasePercentage || 0}% in your CO2 emissions compared to your previous average.`;
        break;
      case 'weekly_summary':
        content = `Your weekly CO2 emissions: ${notification.data.weeklyTotal || 0} kg. ${notification.data.weeklyChange > 0 ? 'Up' : 'Down'} ${Math.abs(notification.data.weeklyChange || 0)}% from last week.`;
        break;
      default:
        content = 'New notification from EcoPilot';
    }
    
    item.innerHTML = `
      <div class="notification-icon">
        <i class="fas fa-${icon}"></i>
      </div>
      <div class="notification-content">
        <h4>${title}</h4>
        <p>${content}</p>
        <div class="notification-meta">
          <span class="notification-date">${formattedDate}</span>
          ${!notification.readAt ? '<button class="mark-read-btn">Mark as Read</button>' : ''}
        </div>
      </div>
    `;
    
    container.appendChild(item);
    
    // Add event listener for "Mark as Read" button
    if (!notification.readAt) {
      item.querySelector('.mark-read-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        
        markNotificationRead(notification.id)
          .then(() => {
            item.classList.add('read');
            item.classList.remove('unread');
            e.target.remove();
            updateNotificationBadge();
          })
          .catch(error => {
            showToast(`Error: ${error.message}`, 'error');
          });
      });
    }
  }
  
  /**
   * Update the notification badge count
   */
  function updateNotificationBadge() {
    getNotifications(false)
      .then(result => {
        if (result.success) {
          const count = result.count || 0;
          const badge = document.querySelector('.notification-badge');
          
          if (badge) {
            if (count > 0) {
              badge.textContent = count;
              badge.style.display = 'block';
            } else {
              badge.style.display = 'none';
            }
          }
        }
      })
      .catch(error => {
        console.error('Error updating notification badge:', error);
      });
  }
  
  /**
   * Show a toast message
   * @param {string} message - Message to display
   * @param {string} type - Message type (success, error, info)
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
    toast.innerHTML = `
      <div class="toast-message">${message}</div>
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
  
  /**
   * Get authentication token from localStorage
   * @returns {string} - Authentication token
   */
  function getAuthToken() {
    return localStorage.getItem('authToken') || '';
  }
  
  // Public API
  return {
    createGoal,
    getGoals,
    getGoalById,
    updateCustomGoalProgress,
    cancelGoal,
    getGoalStats,
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    loadAndDisplayGoals,
    loadAndDisplayGoalStats,
    loadAndDisplayNotifications,
    updateNotificationBadge,
    GOAL_TYPE_LABELS,
    STATUS_LABELS,
    STATUS_COLORS
  };
})(); 