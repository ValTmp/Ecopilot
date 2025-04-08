const logger = require('../services/logger');
const { 
  AuthenticationError,
  ValidationError,
  NotFoundError,
  DatabaseError,
  ExternalServiceError
} = require('../utils/errors');

/**
 * Globaler Error Handler
 * @param {Error} err - Error Objekt
 * @param {Object} req - Express Request
 * @param {Object} res - Express Response
 * @param {Function} next - Express Next Function
 */
const errorHandler = (err, req, res, next) => {
  // Logging
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id
  });

  // Fehlertyp bestimmen
  let statusCode = 500;
  let errorResponse = {
    success: false,
    error: {
      message: 'Internal Server Error',
      code: 'INTERNAL_ERROR'
    }
  };

  // Spezifische Fehlertypen behandeln
  if (err instanceof AuthenticationError) {
    statusCode = 401;
    errorResponse.error = {
      message: err.message,
      code: 'AUTHENTICATION_ERROR'
    };
  } else if (err instanceof ValidationError) {
    statusCode = 400;
    errorResponse.error = {
      message: err.message,
      code: 'VALIDATION_ERROR',
      details: err.details
    };
  } else if (err instanceof NotFoundError) {
    statusCode = 404;
    errorResponse.error = {
      message: err.message,
      code: 'NOT_FOUND'
    };
  } else if (err instanceof DatabaseError) {
    statusCode = 503;
    errorResponse.error = {
      message: 'Database service unavailable',
      code: 'DATABASE_ERROR'
    };
  } else if (err instanceof ExternalServiceError) {
    statusCode = 502;
    errorResponse.error = {
      message: 'External service unavailable',
      code: 'EXTERNAL_SERVICE_ERROR',
      service: err.service
    };
  }

  // Entwicklungsmodus: Stack Trace hinzufügen
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
  }

  // Fehlerantwort senden
  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Handler für nicht gefundene Routen
 * @param {Object} req - Express Request
 * @param {Object} res - Express Response
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'ROUTE_NOT_FOUND'
    }
  });
};

module.exports = {
  errorHandler,
  notFoundHandler
}; 