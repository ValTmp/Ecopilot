const UserService = require('../src/services/userService');
const redis = require('../src/config/redis');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Airtable = require('airtable');
const logger = require('../src/services/logger');

// Mock Redis
jest.mock('../src/config/redis', () => ({
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  flushall: jest.fn()
}));

// Mock JWT
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn()
}));

// Mock Bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

// Mock Airtable
jest.mock('airtable', () => {
  return jest.fn().mockImplementation(() => ({
    base: jest.fn().mockReturnValue({
      table: jest.fn().mockReturnValue({
        create: jest.fn(),
        select: jest.fn().mockReturnValue({
          firstPage: jest.fn(),
          eachPage: jest.fn()
        }),
        update: jest.fn(),
        destroy: jest.fn()
      })
    })
  }));
});

// Mock logger
jest.mock('../src/services/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('UserService', () => {
  let userService;
  let mockAirtable;

  beforeEach(() => {
    userService = new UserService();
    mockAirtable = new Airtable();
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a user successfully', async () => {
      const mockUser = {
        id: 'rec123',
        fields: {
          email: 'test@example.com',
          password: 'hashedPassword',
          name: 'Test User',
          role: 'user'
        }
      };

      const mockTable = mockAirtable.base().table('Users');
      mockTable.create.mockResolvedValue(mockUser);
      bcrypt.hash.mockResolvedValue('hashedPassword');

      const result = await userService.createUser({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      });

      expect(result).toEqual(mockUser);
      expect(mockTable.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'hashedPassword',
        name: 'Test User',
        role: 'user'
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(redis.del).toHaveBeenCalledWith('users:all');
    });

    it('should throw error for missing email', async () => {
      await expect(userService.createUser({
        password: 'password123',
        name: 'Test User'
      })).rejects.toThrow('Email is required');
    });

    it('should throw error for missing password', async () => {
      await expect(userService.createUser({
        email: 'test@example.com',
        name: 'Test User'
      })).rejects.toThrow('Password is required');
    });

    it('should throw error for missing name', async () => {
      await expect(userService.createUser({
        email: 'test@example.com',
        password: 'password123'
      })).rejects.toThrow('Name is required');
    });

    it('should throw error for invalid email format', async () => {
      await expect(userService.createUser({
        email: 'invalid-email',
        password: 'password123',
        name: 'Test User'
      })).rejects.toThrow('Invalid email format');
    });

    it('should throw error for password too short', async () => {
      await expect(userService.createUser({
        email: 'test@example.com',
        password: '123',
        name: 'Test User'
      })).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should handle Airtable errors gracefully', async () => {
      const mockTable = mockAirtable.base().table('Users');
      mockTable.create.mockRejectedValue(new Error('Airtable error'));
      bcrypt.hash.mockResolvedValue('hashedPassword');

      await expect(userService.createUser({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      })).rejects.toThrow('Airtable error');
    });
  });

  describe('getUsers', () => {
    it('should get users from cache if available', async () => {
      const mockUsers = [
        {
          id: 'rec123',
          fields: {
            email: 'test@example.com',
            name: 'Test User',
            role: 'user'
          }
        }
      ];

      redis.get.mockResolvedValue(JSON.stringify(mockUsers));

      const result = await userService.getUsers();

      expect(result).toEqual(mockUsers);
      expect(redis.get).toHaveBeenCalledWith('users:all');
      expect(mockAirtable.base().table).not.toHaveBeenCalled();
    });

    it('should get users from Airtable if not in cache', async () => {
      const mockUsers = [
        {
          id: 'rec123',
          fields: {
            email: 'test@example.com',
            name: 'Test User',
            role: 'user'
          }
        }
      ];

      redis.get.mockResolvedValue(null);

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback(mockUsers, () => {});
        })
      });

      const result = await userService.getUsers();

      expect(result).toEqual(mockUsers);
      expect(redis.get).toHaveBeenCalledWith('users:all');
      expect(mockTable.select).toHaveBeenCalledWith({
        sort: [{ field: 'name', direction: 'asc' }]
      });
      expect(redis.setex).toHaveBeenCalledWith(
        'users:all',
        3600,
        JSON.stringify(mockUsers)
      );
    });

    it('should handle Airtable errors gracefully', async () => {
      redis.get.mockResolvedValue(null);

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          throw new Error('Airtable error');
        })
      });

      await expect(userService.getUsers())
        .rejects.toThrow('Airtable error');
    });
  });

  describe('getUser', () => {
    it('should get user from cache if available', async () => {
      const mockUser = {
        id: 'rec123',
        fields: {
          email: 'test@example.com',
          name: 'Test User',
          role: 'user'
        }
      };

      redis.get.mockResolvedValue(JSON.stringify(mockUser));

      const result = await userService.getUser('rec123');

      expect(result).toEqual(mockUser);
      expect(redis.get).toHaveBeenCalledWith('users:rec123');
      expect(mockAirtable.base().table).not.toHaveBeenCalled();
    });

    it('should get user from Airtable if not in cache', async () => {
      const mockUser = {
        id: 'rec123',
        fields: {
          email: 'test@example.com',
          name: 'Test User',
          role: 'user'
        }
      };

      redis.get.mockResolvedValue(null);

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([mockUser], () => {});
        })
      });

      const result = await userService.getUser('rec123');

      expect(result).toEqual(mockUser);
      expect(redis.get).toHaveBeenCalledWith('users:rec123');
      expect(mockTable.select).toHaveBeenCalledWith({
        filterByFormula: "{id} = 'rec123'"
      });
      expect(redis.setex).toHaveBeenCalledWith(
        'users:rec123',
        3600,
        JSON.stringify(mockUser)
      );
    });

    it('should throw error for missing userId', async () => {
      await expect(userService.getUser(null))
        .rejects.toThrow('User ID is required');
    });

    it('should throw error for non-existent user', async () => {
      redis.get.mockResolvedValue(null);

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([], () => {});
        })
      });

      await expect(userService.getUser('rec123'))
        .rejects.toThrow('User not found');
    });

    it('should handle Airtable errors gracefully', async () => {
      redis.get.mockResolvedValue(null);

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          throw new Error('Airtable error');
        })
      });

      await expect(userService.getUser('rec123'))
        .rejects.toThrow('Airtable error');
    });
  });

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      const mockUser = {
        id: 'rec123',
        fields: {
          email: 'test@example.com',
          name: 'Test User',
          role: 'user'
        }
      };

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([mockUser], () => {});
        })
      });
      mockTable.update.mockResolvedValue({
        ...mockUser,
        fields: {
          ...mockUser.fields,
          name: 'Updated User'
        }
      });

      const result = await userService.updateUser('rec123', {
        name: 'Updated User'
      });

      expect(result.fields.name).toBe('Updated User');
      expect(mockTable.update).toHaveBeenCalledWith('rec123', {
        name: 'Updated User'
      });
      expect(redis.del).toHaveBeenCalledWith('users:rec123');
      expect(redis.del).toHaveBeenCalledWith('users:all');
    });

    it('should throw error for missing userId', async () => {
      await expect(userService.updateUser(null, {
        name: 'Updated User'
      })).rejects.toThrow('User ID is required');
    });

    it('should throw error for non-existent user', async () => {
      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([], () => {});
        })
      });

      await expect(userService.updateUser('rec123', {
        name: 'Updated User'
      })).rejects.toThrow('User not found');
    });

    it('should handle Airtable errors gracefully', async () => {
      const mockUser = {
        id: 'rec123',
        fields: {
          email: 'test@example.com',
          name: 'Test User',
          role: 'user'
        }
      };

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([mockUser], () => {});
        })
      });
      mockTable.update.mockRejectedValue(new Error('Airtable error'));

      await expect(userService.updateUser('rec123', {
        name: 'Updated User'
      })).rejects.toThrow('Airtable error');
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      const mockUser = {
        id: 'rec123',
        fields: {
          email: 'test@example.com',
          name: 'Test User',
          role: 'user'
        }
      };

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([mockUser], () => {});
        })
      });
      mockTable.destroy.mockResolvedValue(mockUser);

      const result = await userService.deleteUser('rec123');

      expect(result).toEqual(mockUser);
      expect(mockTable.destroy).toHaveBeenCalledWith('rec123');
      expect(redis.del).toHaveBeenCalledWith('users:rec123');
      expect(redis.del).toHaveBeenCalledWith('users:all');
    });

    it('should throw error for missing userId', async () => {
      await expect(userService.deleteUser(null))
        .rejects.toThrow('User ID is required');
    });

    it('should throw error for non-existent user', async () => {
      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([], () => {});
        })
      });

      await expect(userService.deleteUser('rec123'))
        .rejects.toThrow('User not found');
    });

    it('should handle Airtable errors gracefully', async () => {
      const mockUser = {
        id: 'rec123',
        fields: {
          email: 'test@example.com',
          name: 'Test User',
          role: 'user'
        }
      };

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([mockUser], () => {});
        })
      });
      mockTable.destroy.mockRejectedValue(new Error('Airtable error'));

      await expect(userService.deleteUser('rec123'))
        .rejects.toThrow('Airtable error');
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const mockUser = {
        id: 'rec123',
        fields: {
          email: 'test@example.com',
          password: 'hashedPassword',
          name: 'Test User',
          role: 'user'
        }
      };

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([mockUser], () => {});
        })
      });

      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('token');

      const result = await userService.login('test@example.com', 'password123');

      expect(result).toEqual({
        user: mockUser,
        token: 'token'
      });
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedPassword');
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'rec123', role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
    });

    it('should throw error for missing email', async () => {
      await expect(userService.login(null, 'password123'))
        .rejects.toThrow('Email is required');
    });

    it('should throw error for missing password', async () => {
      await expect(userService.login('test@example.com', null))
        .rejects.toThrow('Password is required');
    });

    it('should throw error for non-existent user', async () => {
      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([], () => {});
        })
      });

      await expect(userService.login('test@example.com', 'password123'))
        .rejects.toThrow('User not found');
    });

    it('should throw error for invalid password', async () => {
      const mockUser = {
        id: 'rec123',
        fields: {
          email: 'test@example.com',
          password: 'hashedPassword',
          name: 'Test User',
          role: 'user'
        }
      };

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([mockUser], () => {});
        })
      });

      bcrypt.compare.mockResolvedValue(false);

      await expect(userService.login('test@example.com', 'wrongpassword'))
        .rejects.toThrow('Invalid password');
    });

    it('should handle Airtable errors gracefully', async () => {
      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          throw new Error('Airtable error');
        })
      });

      await expect(userService.login('test@example.com', 'password123'))
        .rejects.toThrow('Airtable error');
    });
  });

  describe('verifyToken', () => {
    it('should verify token successfully', async () => {
      const mockUser = {
        id: 'rec123',
        fields: {
          email: 'test@example.com',
          name: 'Test User',
          role: 'user'
        }
      };

      jwt.verify.mockReturnValue({ userId: 'rec123', role: 'user' });

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([mockUser], () => {});
        })
      });

      const result = await userService.verifyToken('token');

      expect(result).toEqual(mockUser);
      expect(jwt.verify).toHaveBeenCalledWith('token', process.env.JWT_SECRET);
    });

    it('should throw error for missing token', async () => {
      await expect(userService.verifyToken(null))
        .rejects.toThrow('Token is required');
    });

    it('should throw error for invalid token', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(userService.verifyToken('invalid-token'))
        .rejects.toThrow('Invalid token');
    });

    it('should throw error for non-existent user', async () => {
      jwt.verify.mockReturnValue({ userId: 'rec123', role: 'user' });

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([], () => {});
        })
      });

      await expect(userService.verifyToken('token'))
        .rejects.toThrow('User not found');
    });

    it('should handle Airtable errors gracefully', async () => {
      jwt.verify.mockReturnValue({ userId: 'rec123', role: 'user' });

      const mockTable = mockAirtable.base().table('Users');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          throw new Error('Airtable error');
        })
      });

      await expect(userService.verifyToken('token'))
        .rejects.toThrow('Airtable error');
    });
  });
}); 