require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const { apiLimiter, authLimiter, gptLimiter, affiliateLimiter } = require('./src/middleware/rateLimiter');
const { affiliateValidation, analyticsValidation, complianceValidation } = require('./src/middleware/validation');
const errorHandler = require('./src/middleware/errorHandler');
const logger = require('./src/services/logger');

// Import routes
const ecoRoutes = require('./src/routes/ecoRoutes');
const monetizationRoutes = require('./src/routes/monetizationRoutes');
const complianceRoutes = require('./src/routes/complianceRoutes');
const webhookRoutes = require('./src/routes/webhookRoutes');
const analyticsRoutes = require('./src/routes/analyticsRoutes');
const affiliateRoutes = require('./src/routes/affiliateRoutes');
const landbotRoutes = require('./src/routes/landbotRoutes');

const app = express();

// Request ID middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  next();
});

// Logging middleware
app.use(morgan('combined', { stream: logger.stream }));

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com", "https://static.landbot.io"],
            styleSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "cdnjs.cloudflare.com"],
            connectSrc: ["'self'", "https://api.landbot.io"]
        }
    },
    xssFilter: true,
    noSniff: true,
    hidePoweredBy: true,
    frameguard: { action: 'deny' }
}));

// Apply rate limiting to all requests
app.use(apiLimiter);

// CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400 // 24 hours
}));

app.use(express.json({ limit: '10kb' })); // Limit body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', // Cache static files for 1 day
    etag: true
}));

// API routes with rate limiting and validation
app.use('/api/eco', gptLimiter, ecoRoutes);
app.use('/api/monetization', affiliateLimiter, monetizationRoutes);
app.use('/api/compliance', authLimiter, complianceRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/affiliate', affiliateLimiter, affiliateRoutes);
app.use('/api/landbot', landbotRoutes);

// Serve the main HTML file for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
}); 