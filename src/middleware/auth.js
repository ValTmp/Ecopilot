const jwt = require('jsonwebtoken');
const { AuthenticationError } = require('../utils/errors');
const logger = require('../services/logger');
const cache = require('../config/redis');
const { db, TABLES, FIELDS } = require('../config/database');
const Joi = require('joi');

// JWT-Konfiguration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const TOKEN_BLACKLIST_PREFIX = 'token_blacklist:';
const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const USER_CACHE_PREFIX = 'user:';
const USER_CACHE_TTL = 300; // 5 minutes in seconds
// @KI-GEN-START [2025-04-06]
const AUTH_ATTEMPTS_PREFIX = 'auth_attempts:';
const MAX_AUTH_ATTEMPTS = 5;
const AUTH_ATTEMPTS_TTL = 60; // 1 minute in seconds
// @KI-GEN-END

// Token validation schema
const tokenSchema = Joi.string().regex(/^[\w-]+\.[\w-]+\.[\w-]+$/).required();

/**
 * Berechnet die TTL in Sekunden basierend auf einem Zeitstring
 * @param {String} timeString - Zeitstring (z.B. '15m', '7d')
 * @returns {Number} TTL in Sekunden
 */
const calculateTTL = (timeString) => {
  const unit = timeString.slice(-1);
  const value = parseInt(timeString.slice(0, -1));
  
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default: return value;
  }
};

/**
 * Generiert einen JWT-Token für einen Benutzer
 * @param {Object} user - Benutzerobjekt
 * @returns {String} JWT-Token
 */
const generateToken = (user) => {
  try {
    return jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  } catch (error) {
    logger.error(`Token generation error: ${error.message}`);
    throw new AuthenticationError('Token generation failed');
  }
};

/**
 * Generiert einen Refresh-Token für einen Benutzer
 * @param {Object} user - Benutzerobjekt
 * @returns {String} Refresh-Token
 */
const generateRefreshToken = (user) => {
  try {
    const tokenId = require('crypto').randomBytes(40).toString('hex');
    const token = jwt.sign(
      { 
        id: user.id,
        tokenId
      },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );
    
    // Berechne TTL für Redis
    const ttl = calculateTTL(JWT_REFRESH_EXPIRES_IN);
    cache.set(`${REFRESH_TOKEN_PREFIX}${user.id}`, tokenId, ttl);
    
    return token;
  } catch (error) {
    logger.error(`Refresh token generation error: ${error.message}`);
    throw new AuthenticationError('Refresh token generation failed');
  }
};

/**
 * Validiert einen JWT-Token
 * @param {String} token - JWT-Token
 * @returns {Object} Decodierter Token
 */
const validateToken = async (token) => {
  try {
    // Validate token format
    const { error } = tokenSchema.validate(token);
    if (error) {
      logger.warn(`Invalid token format: ${error.message}`);
      throw new AuthenticationError('Invalid token format');
    }
    
    // Prüfe, ob Token auf Blacklist steht
    const isBlacklisted = await cache.exists(`${TOKEN_BLACKLIST_PREFIX}${token}`);
    if (isBlacklisted) {
      logger.warn(`Blacklisted token attempted to be used`);
      throw new AuthenticationError('Token has been revoked');
    }
    
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn(`Expired token attempted to be used`);
      throw new AuthenticationError('Token has expired');
    }
    logger.error(`Token validation error: ${error.message}`);
    throw new AuthenticationError('Invalid token');
  }
};

/**
 * Validiert einen Refresh-Token
 * @param {String} token - Refresh-Token
 * @returns {Object} Decodierter Token
 */
const validateRefreshToken = async (token) => {
  try {
    // Validate token format
    const { error } = tokenSchema.validate(token);
    if (error) {
      logger.warn(`Invalid refresh token format: ${error.message}`);
      throw new AuthenticationError('Invalid refresh token format');
    }
    
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    
    // Prüfe, ob Token-ID in Redis gespeichert ist
    const storedTokenId = await cache.get(`${REFRESH_TOKEN_PREFIX}${decoded.id}`);
    if (!storedTokenId || storedTokenId !== decoded.tokenId) {
      logger.warn(`Revoked refresh token attempted to be used`);
      throw new AuthenticationError('Refresh token has been revoked');
    }
    
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn(`Expired refresh token attempted to be used`);
      throw new AuthenticationError('Refresh token has expired');
    }
    logger.error(`Refresh token validation error: ${error.message}`);
    throw new AuthenticationError('Invalid refresh token');
  }
};

/**
 * Widerruft einen Token (für Logout)
 * @param {String} token - JWT-Token
 */
const revokeToken = async (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      throw new AuthenticationError('Invalid token format');
    }
    
    // Berechne verbleibende Zeit bis zum Ablauf
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      // Füge Token zur Blacklist hinzu
      await cache.set(`${TOKEN_BLACKLIST_PREFIX}${token}`, 'revoked', ttl);
      logger.info(`Token revoked successfully`);
    }
  } catch (error) {
    logger.error(`Token revocation error: ${error.message}`);
    throw new AuthenticationError('Token revocation failed');
  }
};

/**
 * Widerruft einen Refresh-Token
 * @param {String} userId - Benutzer-ID
 */
const revokeRefreshToken = async (userId) => {
  try {
    await cache.del(`${REFRESH_TOKEN_PREFIX}${userId}`);
    logger.info(`Refresh token revoked for user ${userId}`);
  } catch (error) {
    logger.error(`Refresh token revocation error: ${error.message}`);
    throw new AuthenticationError('Refresh token revocation failed');
  }
};

/**
 * Middleware für die Authentifizierung
 */
const authenticate = async (req, res, next) => {
  try {
    // @KI-GEN-START [2025-04-06]
    // Rate limiting: Check if too many authentication attempts
    const ip = req.ip || req.connection.remoteAddress;
    const authAttemptsKey = `${AUTH_ATTEMPTS_PREFIX}${ip}`;
    
    // Increment the counter for this IP
    const attempts = await cache.incr(authAttemptsKey);
    
    // Set TTL on first attempt
    if (attempts === 1) {
      await cache.expire(authAttemptsKey, AUTH_ATTEMPTS_TTL);
    }
    
    // Check if too many attempts
    if (attempts > MAX_AUTH_ATTEMPTS) {
      logger.warn(`Rate limit exceeded for IP ${ip}: ${attempts} attempts`);
      throw new AuthenticationError('Too many attempts');
    }
    // @KI-GEN-END
    
    // Check for token in Authorization header or cookie
    let token = null;
    
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    
    // Check cookie if no token in header
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    
    if (!token) {
      logger.warn(`Authentication attempt without token`);
      throw new AuthenticationError('No token provided');
    }
    
    // Validate token
    const decoded = await validateToken(token);
    
    // Attach user information to request
    req.user = decoded;
    logger.info(`User ${decoded.id} authenticated successfully`);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware für die Autorisierung basierend auf Benutzerrollen
 * @param {Array} roles - Erlaubte Rollen
 */
const authorize = (roles = []) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        logger.warn(`Authorization attempt without authentication`);
        throw new AuthenticationError('Authentication required');
      }
      
      if (roles.length && !roles.includes(req.user.role)) {
        logger.warn(`User ${req.user.id} attempted to access restricted resource`);
        throw new AuthenticationError('Insufficient permissions');
      }
      
      logger.info(`User ${req.user.id} authorized for role: ${req.user.role}`);
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware für Token-Erneuerung
 */
const refreshToken = async (req, res, next) => {
  try {
    // Get refresh token from request body or cookie
    let refreshToken = req.body.refreshToken;
    if (!refreshToken && req.cookies && req.cookies.refreshToken) {
      refreshToken = req.cookies.refreshToken;
    }
    
    if (!refreshToken) {
      logger.warn(`Token refresh attempt without refresh token`);
      throw new AuthenticationError('Refresh token is required');
    }
    
    // Validate refresh token
    const decoded = await validateRefreshToken(refreshToken);
    
    // Get user from database
    const user = await getUserById(decoded.id);
    if (!user) {
      logger.warn(`Token refresh attempt for non-existent user ${decoded.id}`);
      throw new AuthenticationError('User not found');
    }
    
    // Generate new tokens
    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);
    
    // Revoke old refresh token
    await revokeRefreshToken(user.id);
    
    // Set cookies if cookie-based auth is used
    if (req.cookies && req.cookies.token) {
      res.cookie('token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: calculateTTL(JWT_EXPIRES_IN) * 1000 // Konvertiere Sekunden in Millisekunden
      });
      
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: calculateTTL(JWT_REFRESH_EXPIRES_IN) * 1000 // Konvertiere Sekunden in Millisekunden
      });
    }
    
    logger.info(`Tokens refreshed for user ${user.id}`);
    
    // Send new tokens in response
    res.json({
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Hilfsfunktion zum Abrufen eines Benutzers anhand der ID
 * @param {String} id - Benutzer-ID
 * @returns {Object} Benutzerobjekt
 */
const getUserById = async (id) => {
  try {
    if (!id) {
      logger.warn('getUserById called without id');
      return null;
    }
    
    // Check Redis cache first
    const cacheKey = `${USER_CACHE_PREFIX}${id}`;
    const cachedUser = await cache.get(cacheKey);
    
    if (cachedUser) {
      logger.info(`User ${id} retrieved from cache`);
      return JSON.parse(cachedUser);
    }
    
    // Cache miss, query Airtable
    logger.info(`Cache miss for user ${id}, querying Airtable`);
    const users = await db.select(TABLES.USERS, { 
      filterByFormula: `{${FIELDS.USERS.ID}} = '${id}'`,
      maxRecords: 1
    });
    
    if (!users || users.length === 0) {
      logger.warn(`User not found: ${id}`);
      return null;
    }
    
    const user = users[0];
    
    // Map Airtable fields to user object
    const userObject = {
      id: user[FIELDS.USERS.ID],
      email: user[FIELDS.USERS.EMAIL],
      name: user[FIELDS.USERS.NAME],
      role: user.role || 'user', // Default to 'user' if role not specified
      points: user[FIELDS.USERS.POINTS] || 0,
      preferences: user[FIELDS.USERS.PREFERENCES] || {}
    };
    
    // Cache the user object
    await cache.set(cacheKey, JSON.stringify(userObject), USER_CACHE_TTL);
    logger.info(`User ${id} cached for ${USER_CACHE_TTL} seconds`);
    
    return userObject;
  } catch (error) {
    logger.error(`Error fetching user from database: ${error.message}`);
    throw new AuthenticationError('Database error');
  }
};

/**
 * Logout middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const logout = async (req, res, next) => {
  try {
    // Get token from request
    let token = null;
    
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    
    // Check cookie if no token in header
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    
    // Revoke token if available
    if (token) {
      await revokeToken(token);
    }
    
    // Revoke refresh token if user is authenticated
    if (req.user && req.user.id) {
      await revokeRefreshToken(req.user.id);
    }
    
    // Clear cookies if they exist
    if (req.cookies && req.cookies.token) {
      res.clearCookie('token');
    }
    
    if (req.cookies && req.cookies.refreshToken) {
      res.clearCookie('refreshToken');
    }
    
    logger.info(`User ${req.user ? req.user.id : 'unknown'} logged out successfully`);
    
    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateToken,
  generateRefreshToken,
  validateToken,
  validateRefreshToken,
  revokeToken,
  revokeRefreshToken,
  authenticate,
  authorize,
  refreshToken,
  logout,
  getUserById
}; 