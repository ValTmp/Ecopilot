const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Airtable = require('airtable');
const redis = require('../config/redis');
const logger = require('./logger');

// Initialize Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const usersTable = base(process.env.AIRTABLE_USERS_TABLE || 'Users');

// Constants
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const CACHE_TTL = 300; // 5 minutes

/**
 * Register a new user
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} - Created user object
 */
async function registerUser(userData) {
  try {
    const { email, password, name } = userData;

    // Validate required fields
    if (!email || !password || !name) {
      throw new Error('Missing required fields');
    }

    // Check if user already exists
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user record
    const userRecord = await usersTable.create([
      {
        fields: {
          email,
          password: hashedPassword,
          name,
          role: 'user',
          points: 0,
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        }
      }
    ]);

    // Invalidate cache
    await redis.del('users:all');

    // Return user without password
    const user = userRecord[0];
    return {
      id: user.id,
      email: user.fields.email,
      name: user.fields.name,
      role: user.fields.role,
      points: user.fields.points,
      createdAt: user.fields.createdAt
    };
  } catch (error) {
    logger.error('Error registering user', { error: error.message });
    throw error;
  }
}

/**
 * Authenticate a user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} - Authentication result with tokens
 */
async function authenticateUser(email, password) {
  try {
    // Find user by email
    const user = await findUserByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.fields.password);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await usersTable.update(user.id, {
      lastLogin: new Date().toISOString()
    });

    // Invalidate cache
    await redis.del(`user:${user.id}`);
    await redis.del('users:all');

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token in Redis
    await redis.setex(`refresh:${user.id}`, 7 * 24 * 60 * 60, refreshToken);

    return {
      user: {
        id: user.id,
        email: user.fields.email,
        name: user.fields.name,
        role: user.fields.role,
        points: user.fields.points
      },
      accessToken,
      refreshToken
    };
  } catch (error) {
    logger.error('Error authenticating user', { error: error.message });
    throw error;
  }
}

/**
 * Refresh access token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} - New access token
 */
async function refreshAccessToken(refreshToken) {
  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Check if token exists in Redis
    const storedToken = await redis.get(`refresh:${decoded.id}`);
    if (!storedToken || storedToken !== refreshToken) {
      throw new Error('Invalid refresh token');
    }

    // Find user
    const user = await findUserById(decoded.id);
    if (!user) {
      throw new Error('User not found');
    }

    // Generate new access token
    const accessToken = generateAccessToken(user);

    return { accessToken };
  } catch (error) {
    logger.error('Error refreshing token', { error: error.message });
    throw error;
  }
}

/**
 * Logout user
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
async function logoutUser(userId) {
  try {
    // Remove refresh token from Redis
    await redis.del(`refresh:${userId}`);
  } catch (error) {
    logger.error('Error logging out user', { error: error.message });
    throw error;
  }
}

/**
 * Find user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} - User object or null
 */
async function findUserByEmail(email) {
  try {
    // Check cache first
    const cachedUser = await redis.get(`user:email:${email}`);
    if (cachedUser) {
      return JSON.parse(cachedUser);
    }

    // Query Airtable
    const records = await usersTable.select({
      filterByFormula: `{email} = '${email}'`,
      maxRecords: 1
    }).firstPage();

    if (records.length === 0) {
      return null;
    }

    // Cache user
    const user = records[0];
    await redis.setex(`user:email:${email}`, CACHE_TTL, JSON.stringify(user));
    await redis.setex(`user:${user.id}`, CACHE_TTL, JSON.stringify(user));

    return user;
  } catch (error) {
    logger.error('Error finding user by email', { error: error.message });
    throw error;
  }
}

/**
 * Find user by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} - User object or null
 */
async function findUserById(userId) {
  try {
    // Check cache first
    const cachedUser = await redis.get(`user:${userId}`);
    if (cachedUser) {
      return JSON.parse(cachedUser);
    }

    // Query Airtable
    const user = await usersTable.find(userId);

    // Cache user
    await redis.setex(`user:${userId}`, CACHE_TTL, JSON.stringify(user));
    await redis.setex(`user:email:${user.fields.email}`, CACHE_TTL, JSON.stringify(user));

    return user;
  } catch (error) {
    logger.error('Error finding user by ID', { error: error.message });
    return null;
  }
}

/**
 * Get all users
 * @returns {Promise<Array>} - Array of user objects
 */
async function getAllUsers() {
  try {
    // Check cache first
    const cachedUsers = await redis.get('users:all');
    if (cachedUsers) {
      return JSON.parse(cachedUsers);
    }

    // Query Airtable
    const records = await usersTable.select().all();
    
    // Format users
    const users = records.map(record => ({
      id: record.id,
      email: record.fields.email,
      name: record.fields.name,
      role: record.fields.role,
      points: record.fields.points,
      createdAt: record.fields.createdAt,
      lastLogin: record.fields.lastLogin
    }));

    // Cache users
    await redis.setex('users:all', CACHE_TTL, JSON.stringify(users));

    return users;
  } catch (error) {
    logger.error('Error getting all users', { error: error.message });
    throw error;
  }
}

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} - Updated user object
 */
async function updateUserProfile(userId, updateData) {
  try {
    // Find user
    const user = await findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Prepare update fields
    const updateFields = {};
    
    if (updateData.name) updateFields.name = updateData.name;
    if (updateData.email && updateData.email !== user.fields.email) {
      // Check if email is already taken
      const existingUser = await findUserByEmail(updateData.email);
      if (existingUser && existingUser.id !== userId) {
        throw new Error('Email already in use');
      }
      updateFields.email = updateData.email;
    }
    
    // Update user
    const updatedUser = await usersTable.update(userId, updateFields);

    // Invalidate cache
    await redis.del(`user:${userId}`);
    await redis.del(`user:email:${user.fields.email}`);
    if (updateData.email) {
      await redis.del(`user:email:${updateData.email}`);
    }
    await redis.del('users:all');

    return {
      id: updatedUser.id,
      email: updatedUser.fields.email,
      name: updatedUser.fields.name,
      role: updatedUser.fields.role,
      points: updatedUser.fields.points
    };
  } catch (error) {
    logger.error('Error updating user profile', { error: error.message });
    throw error;
  }
}

/**
 * Change user password
 * @param {string} userId - User ID
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<void>}
 */
async function changePassword(userId, currentPassword, newPassword) {
  try {
    // Find user
    const user = await findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.fields.password);
    if (!isPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await usersTable.update(userId, {
      password: hashedPassword
    });

    // Invalidate cache
    await redis.del(`user:${userId}`);
    await redis.del(`user:email:${user.fields.email}`);
    await redis.del('users:all');
  } catch (error) {
    logger.error('Error changing password', { error: error.message });
    throw error;
  }
}

/**
 * Add points to user
 * @param {string} userId - User ID
 * @param {number} points - Points to add
 * @returns {Promise<Object>} - Updated user object
 */
async function addUserPoints(userId, points) {
  try {
    // Find user
    const user = await findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Calculate new points
    const currentPoints = user.fields.points || 0;
    const newPoints = currentPoints + points;

    // Update user
    const updatedUser = await usersTable.update(userId, {
      points: newPoints
    });

    // Invalidate cache
    await redis.del(`user:${userId}`);
    await redis.del(`user:email:${user.fields.email}`);
    await redis.del('users:all');

    return {
      id: updatedUser.id,
      email: updatedUser.fields.email,
      name: updatedUser.fields.name,
      role: updatedUser.fields.role,
      points: updatedUser.fields.points
    };
  } catch (error) {
    logger.error('Error adding user points', { error: error.message });
    throw error;
  }
}

/**
 * Generate access token
 * @param {Object} user - User object
 * @returns {string} - JWT access token
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.fields.email,
      role: user.fields.role
    },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * Generate refresh token
 * @param {Object} user - User object
 * @returns {string} - JWT refresh token
 */
function generateRefreshToken(user) {
  return jwt.sign(
    {
      id: user.id
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

/**
 * Verify token
 * @param {string} token - JWT token
 * @returns {Object} - Decoded token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    logger.error('Error verifying token', { error: error.message });
    throw new Error('Invalid token');
  }
}

module.exports = {
  registerUser,
  authenticateUser,
  refreshAccessToken,
  logoutUser,
  findUserByEmail,
  findUserById,
  getAllUsers,
  updateUserProfile,
  changePassword,
  addUserPoints,
  verifyToken
}; 