// Cache-Abstraktion mit Redis-Unterstützung
const Redis = require('ioredis');
const NodeCache = require('node-cache');
const logger = require('../services/logger');

class Cache {
  constructor(options = {}) {
    this.engine = options.engine || 'memory';
    this.options = options;
    
    if (this.engine === 'redis') {
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB || 0,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3
      });
      
      // Redis-Events
      this.client.on('connect', () => {
        logger.info('Redis connected successfully');
      });
      
      this.client.on('error', (error) => {
        logger.error(`Redis error: ${error.message}`);
      });
      
      this.client.on('ready', () => {
        logger.info('Redis is ready to accept commands');
      });
      
      this.client.on('close', () => {
        logger.warn('Redis connection closed');
      });
      
      this.client.on('reconnecting', () => {
        logger.info('Redis reconnecting...');
      });
    } else {
      // Fallback auf In-Memory-Cache
      this.client = new NodeCache({
        stdTTL: options.ttl || 3600,
        checkperiod: 600,
        useClones: false
      });
      
      // Cache-Events
      this.client.on('expired', (key, value) => {
        logger.debug(`Cache key expired: ${key}`);
      });
      
      this.client.on('del', (key, value) => {
        logger.debug(`Cache key deleted: ${key}`);
      });
    }
  }
  
  async get(key) {
    try {
      if (this.engine === 'redis') {
        return await this.client.get(key);
      } else {
        return this.client.get(key);
      }
    } catch (error) {
      logger.error(`Error getting from cache: ${error.message}`);
      return null;
    }
  }
  
  async set(key, value, ttl = null) {
    try {
      if (this.engine === 'redis') {
        if (ttl) {
          return await this.client.set(key, value, 'EX', ttl);
        }
        return await this.client.set(key, value);
      } else {
        return this.client.set(key, value, ttl);
      }
    } catch (error) {
      logger.error(`Error setting cache: ${error.message}`);
      return false;
    }
  }
  
  async del(key) {
    try {
      if (this.engine === 'redis') {
        return await this.client.del(key);
      } else {
        return this.client.del(key);
      }
    } catch (error) {
      logger.error(`Error deleting from cache: ${error.message}`);
      return 0;
    }
  }
  
  async exists(key) {
    try {
      if (this.engine === 'redis') {
        return await this.client.exists(key);
      } else {
        return this.client.has(key) ? 1 : 0;
      }
    } catch (error) {
      logger.error(`Error checking cache key existence: ${error.message}`);
      return 0;
    }
  }
  
  async incr(key) {
    try {
      if (this.engine === 'redis') {
        return await this.client.incr(key);
      } else {
        const value = this.client.get(key) || 0;
        const newValue = parseInt(value) + 1;
        this.client.set(key, newValue);
        return newValue;
      }
    } catch (error) {
      logger.error(`Error incrementing cache key: ${error.message}`);
      return 0;
    }
  }
  
  async expire(key, seconds) {
    try {
      if (this.engine === 'redis') {
        return await this.client.expire(key, seconds);
      } else {
        // NodeCache unterstützt kein expire pro Key
        return 1;
      }
    } catch (error) {
      logger.error(`Error setting cache key expiration: ${error.message}`);
      return 0;
    }
  }
  
  async lpush(key, value) {
    try {
      if (this.engine === 'redis') {
        return await this.client.lpush(key, value);
      } else {
        // NodeCache unterstützt keine Listen
        return 0;
      }
    } catch (error) {
      logger.error(`Error pushing to list: ${error.message}`);
      return 0;
    }
  }
  
  async ltrim(key, start, stop) {
    try {
      if (this.engine === 'redis') {
        return await this.client.ltrim(key, start, stop);
      } else {
        // NodeCache unterstützt keine Listen
        return 'OK';
      }
    } catch (error) {
      logger.error(`Error trimming list: ${error.message}`);
      return 'ERROR';
    }
  }
  
  async hset(key, field, value) {
    try {
      if (this.engine === 'redis') {
        return await this.client.hset(key, field, value);
      } else {
        // NodeCache unterstützt keine Hashes
        return 0;
      }
    } catch (error) {
      logger.error(`Error setting hash field: ${error.message}`);
      return 0;
    }
  }
  
  async hget(key, field) {
    try {
      if (this.engine === 'redis') {
        return await this.client.hget(key, field);
      } else {
        // NodeCache unterstützt keine Hashes
        return null;
      }
    } catch (error) {
      logger.error(`Error getting hash field: ${error.message}`);
      return null;
    }
  }
  
  async hgetall(key) {
    try {
      if (this.engine === 'redis') {
        return await this.client.hgetall(key);
      } else {
        // NodeCache unterstützt keine Hashes
        return {};
      }
    } catch (error) {
      logger.error(`Error getting all hash fields: ${error.message}`);
      return {};
    }
  }
}

// Singleton-Instanz erstellen
const cache = new Cache({
  engine: process.env.CACHE_ENGINE || 'memory',
  ttl: process.env.CACHE_TTL || 3600
});

module.exports = cache; 