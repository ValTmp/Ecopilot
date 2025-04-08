const winston = require('winston');
const { format } = winston;

// Log-Level basierend auf Umgebung
const level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

// Custom levels with CO2 logging
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    co2: 3,
    http: 4,
    debug: 5
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    co2: 'cyan',
    http: 'magenta',
    debug: 'gray'
  }
};

// Log-Format definieren
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

// CO2 specific format
const co2Format = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    
    return msg;
  })
);

// Logger konfigurieren
const logger = winston.createLogger({
  levels: customLevels.levels,
  format: logFormat,
  defaultMeta: { service: 'eco-pilot' },
  transports: [
    // Konsolen-Transport für Entwicklung
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // Datei-Transport für Fehler
    new winston.transports.File({ 
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Specific transport for CO2 logs
    new winston.transports.File({ 
      filename: 'logs/co2.log',
      level: 'co2',
      format: co2Format,
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

// Add colors to winston
winston.addColors(customLevels.colors);

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
    logger.http('Request completed', {
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

/**
 * Log CO2 calculation events
 * @param {string} action - The CO2 action being performed
 * @param {Object} data - The calculation data
 */
const logCO2 = (action, data) => {
  logger.co2(`CO2 ${action}`, data);
};

/**
 * Log CO2 calculation result
 * @param {string} userId - User ID
 * @param {string} transportType - Transport type
 * @param {number} distance - Distance in km
 * @param {number} emissions - CO2 emissions in kg
 */
const logCO2Calculation = (userId, transportType, distance, emissions) => {
  logger.co2('CO2 Calculation', {
    userId,
    transportType,
    distance,
    emissions,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log CO2 history retrieval
 * @param {string} userId - User ID
 * @param {number} recordCount - Number of records retrieved
 * @param {boolean} fromCache - Whether the data came from cache
 */
const logCO2History = (userId, recordCount, fromCache) => {
  logger.co2('CO2 History Retrieved', {
    userId,
    recordCount,
    fromCache,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  error: (...args) => logger.error(...args),
  warn: (...args) => logger.warn(...args),
  info: (...args) => logger.info(...args),
  co2: (...args) => logger.co2(...args),
  http: (...args) => logger.http(...args),
  debug: (...args) => logger.debug(...args),
  logRequest,
  logError,
  logCO2,
  logCO2Calculation,
  logCO2History
}; 