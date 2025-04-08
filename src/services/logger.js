const winston = require('winston');
const { format } = winston;

// Log-Level basierend auf Umgebung
const level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

// Log-Format definieren
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

// Logger konfigurieren
const logger = winston.createLogger({
  level,
  format: logFormat,
  defaultMeta: { service: 'eco-pilot' },
  transports: [
    // Konsolen-Transport für Entwicklung
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),
    // Datei-Transport für Fehler
    new winston.transports.File({ 
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Datei-Transport für alle Logs
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Unbehandelte Fehler abfangen
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Logging-Hilfsfunktionen
const logRequest = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });
  
  next();
};

const logError = (error, req = null) => {
  const errorLog = {
    message: error.message,
    stack: error.stack,
    code: error.code
  };
  
  if (req) {
    errorLog.request = {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userId: req.user?.id
    };
  }
  
  logger.error('Error occurred:', errorLog);
};

module.exports = {
  logger,
  logRequest,
  logError
}; 