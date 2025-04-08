const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const { RateLimitError } = require('../utils/errors');

// Redis-Client konfigurieren
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  enableOfflineQueue: false
});

// General API rate limiter
const apiLimiter = rateLimit({
    store: new RedisStore({
        client: redis,
        prefix: 'rate-limit:api:'
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later',
    handler: (req, res) => {
        throw new RateLimitError('Rate limit exceeded');
    }
});

// More strict limiter for authentication endpoints
const authLimiter = rateLimit({
    store: new RedisStore({
        client: redis,
        prefix: 'rate-limit:auth:'
    }),
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'Too many failed login attempts, please try again later',
    handler: (req, res) => {
        throw new RateLimitError('Too many failed login attempts');
    }
});

// Limiter for GPT queries
const gptLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // Limit each IP to 10 requests per minute
    message: 'Too many GPT queries, please try again after a minute'
});

// Limiter for affiliate endpoints
const affiliateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // Limit each IP to 30 requests per minute
    message: 'Too many affiliate requests, please try again after a minute'
});

// Rate-Limiter für CO2-Berechnungen
const co2CalculatorLimiter = rateLimit({
    store: new RedisStore({
        client: redis,
        prefix: 'rate-limit:co2:'
    }),
    windowMs: 60 * 60 * 1000, // 1 Stunde
    max: 1000, // 1000 Berechnungen pro IP
    message: 'CO2 calculation rate limit exceeded',
    handler: (req, res) => {
        throw new RateLimitError('CO2 calculation rate limit exceeded');
    }
});

// Dynamischer Rate-Limiter basierend auf Benutzerrolle
const roleBasedLimiter = (role) => {
    const limits = {
        admin: 1000,
        premium: 500,
        user: 100
    };

    return rateLimit({
        store: new RedisStore({
            client: redis,
            prefix: `rate-limit:${role}:`
        }),
        windowMs: 60 * 60 * 1000, // 1 Stunde
        max: limits[role] || 100,
        message: `Rate limit exceeded for ${role} role`,
        handler: (req, res) => {
            throw new RateLimitError(`Rate limit exceeded for ${role} role`);
        }
    });
};

module.exports = {
    apiLimiter,
    authLimiter,
    gptLimiter,
    affiliateLimiter,
    co2CalculatorLimiter,
    roleBasedLimiter
}; 