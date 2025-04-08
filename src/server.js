// Import monitoring routes
const monitoringRoutes = require('./routes/monitoringRoutes');

// Apply security middleware
applySecurityMiddleware(app);

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/co2', co2Routes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/monitoring', monitoringRoutes); // Add monitoring routes 