# Real-Time Notification System

The EcoPilot platform includes a real-time notification system to provide users with immediate updates about their goals, CO2 calculations, and other important events.

## Features

- Real-time notifications using Socket.IO
- Desktop notifications with sound alerts
- Toast notifications for new events
- Badge counter for unread notifications
- Notification history with read/unread status
- Email notifications for important events

## Architecture

The notification system consists of several components:

1. **Backend Services**:
   - `notificationService.js`: Core service for creating and managing notifications
   - `socketService.js`: WebSocket service for real-time communication
   - `cronService.js`: Scheduled tasks for notification generation

2. **Frontend Components**:
   - `notifications.js`: Client-side notification handling
   - UI components for displaying notifications
   - Toast notification system

3. **Storage**:
   - Airtable for persistent storage of notifications
   - Redis for caching and real-time socket connections

## Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `notification:new` | Server → Client | Sent when a new notification is created |
| `notification:read` | Client → Server | Sent when a user reads a notification |
| `notification:read:all` | Client → Server | Sent when a user marks all notifications as read |
| `notification:badge:update` | Server → Client | Sent to update the notification badge count |

## Notification Types

The system supports the following notification types:

| Type | Description | Trigger |
|------|-------------|---------|
| `goal_completed` | Goal completion notification | When a user completes a CO2 reduction goal |
| `goal_progress` | Goal progress update | When a user reaches a milestone (25%, 50%, 75%) |
| `goal_deadline_approaching` | Deadline reminder | When a goal deadline is approaching (7 or 3 days) |
| `goal_created` | Goal creation confirmation | When a user creates a new goal |
| `emissions_increase` | Emissions increase alert | When user's emissions increase significantly |
| `weekly_summary` | Weekly emissions summary | Sent every Monday with the previous week's stats |

## Implementation Details

### Backend

The notification system is implemented using Socket.IO for real-time communication. The `socketService.js` file initializes Socket.IO and handles authentication and event listeners.

Notifications are created through the `notificationService.js` module, which:
1. Creates a notification record in Airtable
2. Invalidates Redis cache for the user's notifications
3. Emits a real-time event to the user's socket connection
4. Sends an email notification (if requested)

Scheduled notifications are managed by `cronService.js`, which runs periodic tasks to:
1. Process the notification queue and send pending emails
2. Check for goal-related notifications (deadlines, progress)
3. Generate weekly emission summaries
4. Check for significant emissions increases

### Frontend

The frontend notification system is implemented using:
1. `notifications.js` - Handles Socket.IO connection and real-time updates
2. CSS styles for notification components in `main.css`
3. HTML templates for displaying notifications

## Getting Started

### Prerequisites

- Socket.IO client library included in HTML:
  ```html
  <script src="/socket.io/socket.io.js"></script>
  ```

- Add the notifications script:
  ```html
  <script src="js/notifications.js"></script>
  ```

### Initialization

The notification system initializes automatically when the DOM is loaded. It:
1. Establishes a Socket.IO connection with the server
2. Sets up event listeners for notifications
3. Loads any existing notifications

### API Reference

#### Socket Events (Client-Side)

```javascript
// Connect to Socket.IO with auth token
const socket = io({
  auth: {
    token: 'user-auth-token'
  }
});

// Listen for new notifications
socket.on('notification:new', (notification) => {
  // Handle new notification
});

// Mark notification as read
socket.emit('notification:read', { notificationId: 'notification-id' });

// Mark all notifications as read
socket.emit('notification:read:all');

// Request badge count update
socket.emit('notification:badge:update');
```

#### NotificationsManager API

```javascript
// Initialize notifications
NotificationsManager.initialize();

// Load notifications
NotificationsManager.loadNotifications();

// Mark all as read
NotificationsManager.markAllAsRead();
```

## Troubleshooting

### Common Issues

- **Notifications not appearing in real-time**: Check your Socket.IO connection and authentication token
- **Socket connection errors**: Verify the server is running and accessible
- **Missing notification sound**: Ensure the sound file exists at `/sounds/notification.mp3`

## Future Enhancements

- Push notifications for mobile devices
- Notification categories and filtering
- User notification preferences
- Rich media notifications with images
- Interactive notifications with action buttons 