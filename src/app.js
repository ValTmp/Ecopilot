const express = require('express');
const path = require('path');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const http = require('http');
const { errorHandler } = require('./middleware/error');
const { requestLogger } = require('./middleware/logging');
const { 
  securityMiddleware, 
  authLimiter, 
  co2CalculatorLimiter, 
  roleBasedLimiter, 
  cspReportHandler 
} = require('./middleware/security');
const { authenticate, authorize, refreshToken } = require('./middleware/auth');
const { validateRequest } = require('./middleware/validation');
const landbotService = require('./services/landbotService');
// @KI-GEN-START [2025-04-06]
// Import route modules
const co2Routes = require('./routes/co2Routes');
const recommendationRoutes = require('./routes/recommendationRoutes');
// @KI-GEN-END
// Import new routes
const goalRoutes = require('./routes/goalRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const co2Calculator = require('./services/co2Calculator');
const logger = require('./services/logger');
const cronService = require('./services/cronService');
const socketService = require('./services/socketService');

// Express-App initialisieren
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
socketService.initialize(server);

// Basis-Middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(compression());
app.use(cookieParser());

// Sicherheits-Middleware
app.use(securityMiddleware);

// Logging
app.use(requestLogger);

// Statische Dateien
app.use(express.static(path.join(__dirname, 'public')));

// API-Routen
const apiRouter = express.Router();

// Auth-Routen
apiRouter.post('/auth/register', 
  validateRequest('register'),
  async (req, res) => {
    // TODO: Implementiere Benutzerregistrierung
    res.status(201).json({ message: 'User registered successfully' });
  }
);

apiRouter.post('/auth/login',
  authLimiter,
  validateRequest('login'),
  async (req, res) => {
    // TODO: Implementiere Login
    res.status(200).json({ message: 'Login successful' });
  }
);

apiRouter.post('/auth/logout',
  authenticate,
  async (req, res) => {
    // TODO: Implementiere Logout
    res.status(200).json({ message: 'Logout successful' });
  }
);

apiRouter.post('/auth/refresh-token',
  refreshToken,
  async (req, res) => {
    // TODO: Implementiere Token-Aktualisierung
    res.status(200).json({ message: 'Token refreshed successfully' });
  }
);

// @KI-GEN-START [2025-04-06]
// Use CO2 routes
apiRouter.use('/co2', co2Routes);
// Use recommendation routes
apiRouter.use('/recommendations', recommendationRoutes);
// @KI-GEN-END

// Goal and notification routes
apiRouter.use('/goals', goalRoutes);
apiRouter.use('/notifications', notificationRoutes);

// Remove the old CO2 calculation endpoint
// CO2-Berechnungen
// apiRouter.post('/co2/calculate',
//   co2CalculatorLimiter,
//   authenticate,
//   validateRequest('co2Calculation'),
//   // @KI-GEN-START [2025-04-06]
//   async (req, res, next) => {
//     try {
//       const { transportType, distance } = req.body;
//       
//       // Convert distance to number if needed
//       const distanceValue = typeof distance === 'string' ? parseFloat(distance) : distance;
//       
//       // Calculate emissions
//       const emissions = co2Calculator.calculateCO2(transportType, distanceValue);
//       
//       // Return result
//       res.status(200).json({ 
//         emissions,
//         unit: 'kg',
//         transportType,
//         distance: distanceValue
//       });
//     } catch (error) {
//       next(error);
//     }
//   }
//   // @KI-GEN-END
// );

// Remove the old CO2 history endpoint
// apiRouter.get('/co2/history',
//   authenticate,
//   async (req, res, next) => {
//     try {
//       const history = await co2Calculator.getUserHistory(req.user.id);
//       res.json(history);
//     } catch (error) {
//       next(error);
//     }
//   }
// );

// Produkt-Management
apiRouter.get('/products',
  authenticate,
  roleBasedLimiter('user'),
  async (req, res) => {
    // TODO: Implementiere Produktliste
    res.status(200).json({ message: 'Products retrieved successfully' });
  }
);

apiRouter.post('/products',
  authenticate,
  authorize(['admin']),
  roleBasedLimiter('admin'),
  validateRequest('product'),
  async (req, res) => {
    // TODO: Implementiere Produkterstellung
    res.status(201).json({ message: 'Product created successfully' });
  }
);

apiRouter.put('/products/:id',
  authenticate,
  authorize(['admin']),
  validateRequest('product'),
  async (req, res, next) => {
    try {
      // TODO: Implementiere Produktaktualisierung
      res.json({ message: 'Product updated successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// Analytics
apiRouter.post('/analytics/track',
  authenticate,
  async (req, res) => {
    // TODO: Implementiere Analytics-Tracking
    res.status(200).json({ message: 'Event tracked successfully' });
  }
);

// Landbot-Integration
apiRouter.post('/chat/initialize',
  authenticate,
  async (req, res, next) => {
    try {
      const config = await landbotService.initializeWidget(req, res);
      res.json(config);
    } catch (error) {
      next(error);
    }
  }
);

apiRouter.post('/chat/message',
  authenticate,
  validateRequest('chatMessage'),
  async (req, res, next) => {
    try {
      const response = await landbotService.sendMessage(req, req.body.message);
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

apiRouter.get('/chat/history',
  authenticate,
  async (req, res, next) => {
    try {
      const history = await landbotService.getChatHistory(req);
      res.json(history);
    } catch (error) {
      next(error);
    }
  }
);

apiRouter.post('/chat/end',
  authenticate,
  async (req, res, next) => {
    try {
      await landbotService.endSession(req, res);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// Security routes
apiRouter.post('/security/csp-report', cspReportHandler);

// API-Router mounten
app.use('/api', apiRouter);

// 404-Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error-Handler
app.use(errorHandler);

// Initialize cron jobs
cronService.initCronJobs();

// Server starten
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info('EcoPilot service started with CO2 goals and real-time notifications enabled');
});

module.exports = { app, server }; 