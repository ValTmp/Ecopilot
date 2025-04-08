const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const cache = require('../config/redis');
const logger = require('../services/logger');

/**
 * Security-Headers mit Helmet konfigurieren
 */
const cspConfig = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      // Remove unsafe-inline and use nonces or hashes instead
      "'nonce-${nonce}'",
      'https://cdn.landbot.io',
      'https://www.google-analytics.com',
      'https://www.googletagmanager.com'
    ],
    styleSrc: [
      "'self'",
      // Remove unsafe-inline and use nonces or hashes instead
      "'nonce-${nonce}'",
      'https://cdn.landbot.io',
      'https://fonts.googleapis.com'
    ],
    imgSrc: [
      "'self'",
      'data:',
      'https:',
      'blob:'
    ],
    fontSrc: [
      "'self'",
      'https://fonts.gstatic.com'
    ],
    connectSrc: [
      "'self'",
      'https://api.landbot.io',
      'https://www.google-analytics.com'
    ],
    frameSrc: [
      "'self'",
      'https://cdn.landbot.io'
    ],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    workerSrc: ["'self'"],
    childSrc: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: [],
    // Add report-uri for CSP violations
    reportUri: '/api/security/csp-report'
  }
};

/**
 * CORS-Konfiguration
 */
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['X-CSRF-Token'],
  credentials: true,
  maxAge: 86400 // 24 Stunden
};

/**
 * Rate Limiter für API-Endpunkte
 */
const apiLimiter = rateLimit({
  store: new RedisStore({
    client: cache.client,
    prefix: 'rate_limit:api:'
  }),
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 100, // 100 Anfragen pro IP
  message: {
    error: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate Limiter für Authentifizierung
 */
const authLimiter = rateLimit({
  store: new RedisStore({
    client: cache.client,
    prefix: 'rate_limit:auth:'
  }),
  windowMs: 60 * 60 * 1000, // 1 Stunde
  max: 5, // 5 fehlgeschlagene Versuche
  message: {
    error: 'Too many failed login attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const redis = new Redis(process.env.REDIS_URL);

/**
 * Rate Limiter für CO2-Berechnungen
 */
// @KI-GEN-START
const co2CalculatorLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'co2_calc:'
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: {
    error: 'Too many CO2 calculations. Please wait a minute before trying again.'
  },
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IP
    const userId = req.user ? req.user.id : null;
    return userId ? `user:${userId}` : req.ip;
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for CO2 calculator', { 
      ip: req.ip,
      userId: req.user ? req.user.id : 'anonymous'
    });
    res.status(429).json({
      error: 'Too many CO2 calculations. Please wait a minute before trying again.',
      retryAfter: Math.ceil(60 - ((Date.now() - req.rateLimit.resetTime) / 1000))
    });
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false // Disable the `X-RateLimit-*` headers
});
// @KI-GEN-END

/**
 * Rollenbasierter Rate Limiter
 */
const roleBasedLimiter = (role) => {
  const limits = {
    admin: 1000,
    premium: 500,
    user: 100
  };
  
  return rateLimit({
    store: new RedisStore({
      client: cache.client,
      prefix: `rate_limit:${role}:`
    }),
    windowMs: 60 * 60 * 1000, // 1 Stunde
    max: limits[role] || limits.user,
    message: {
      error: 'Rate limit exceeded for your role, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

/**
 * Zusätzliche Sicherheitsheader
 */
const additionalSecurityHeaders = (req, res, next) => {
  // Verhindere Clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Aktiviere XSS-Schutz
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Verhindere MIME-Type-Sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Referrer-Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Feature-Policy
  res.setHeader('Feature-Policy', [
    "camera 'none'",
    "microphone 'none'",
    "geolocation 'none'",
    "payment 'none'"
  ].join('; '));
  
  // Permissions-Policy (modern replacement for Feature-Policy)
  res.setHeader('Permissions-Policy', [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "payment=()"
  ].join(', '));
  
  // Cross-Origin-Embedder-Policy
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  
  // Cross-Origin-Opener-Policy
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  
  // Cross-Origin-Resource-Policy
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  
  next();
};

/**
 * CSP Report Handler
 */
const cspReportHandler = (req, res) => {
  try {
    const report = req.body;
    logger.warn(`CSP Violation: ${JSON.stringify(report)}`);
    
    // Store violation in Redis for analysis
    const violationKey = `csp_violation:${Date.now()}`;
    cache.set(violationKey, JSON.stringify(report), 86400); // Store for 24 hours
    
    res.status(204).end();
  } catch (error) {
    logger.error(`Error handling CSP report: ${error.message}`);
    res.status(500).end();
  }
};

/**
 * Nonce Generator Middleware
 */
const nonceGenerator = (req, res, next) => {
  // Generate a random nonce for CSP
  const nonce = require('crypto').randomBytes(16).toString('base64');
  res.locals.nonce = nonce;
  next();
};

/**
 * Security-Middleware konfigurieren
 */
const securityMiddleware = [
  // Nonce Generator
  nonceGenerator,
  
  // Basis-Sicherheitsheader
  helmet({
    contentSecurityPolicy: {
      directives: cspConfig.directives,
      reportOnly: process.env.NODE_ENV !== 'production'
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
  }),
  
  // CORS
  cors(corsOptions),
  
  // HTTP Parameter Pollution Prevention
  hpp(),
  
  // XSS-Schutz
  xss(),
  
  // MongoDB Injection Prevention
  mongoSanitize(),
  
  // Zusätzliche Security-Header
  additionalSecurityHeaders,
  
  // API Rate Limiting
  apiLimiter
];

module.exports = {
  securityMiddleware,
  authLimiter,
  co2CalculatorLimiter,
  roleBasedLimiter,
  cspReportHandler
}; 