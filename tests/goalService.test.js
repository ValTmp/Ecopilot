const GoalService = require('../src/services/goalService');
const redis = require('../src/config/redis');
const Airtable = require('airtable');
const co2Calculator = require('../src/services/co2Calculator');

// Mock Redis
jest.mock('../src/config/redis', () => ({
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  flushall: jest.fn()
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

// Mock co2Calculator
jest.mock('../src/services/co2Calculator', () => ({
  getUserHistory: jest.fn()
}));

describe('GoalService', () => {
  let goalService;
  let mockAirtable;

  beforeEach(() => {
    goalService = new GoalService();
    mockAirtable = new Airtable();
    jest.clearAllMocks();
  });

  describe('createGoal', () => {
    it('should create a goal successfully', async () => {
      const mockGoal = {
        id: 'rec123',
        fields: {
          userId: 'user123',
          type: 'reduce',
          target: 20,
          deadline: '2024-12-31',
          status: 'active',
          progress: 0
        }
      };

      const mockTable = mockAirtable.base().table('Goals');
      mockTable.create.mockResolvedValue(mockGoal);

      const result = await goalService.createGoal({
        userId: 'user123',
        type: 'reduce',
        target: 20,
        deadline: '2024-12-31'
      });

      expect(result).toEqual(mockGoal);
      expect(mockTable.create).toHaveBeenCalledWith({
        userId: 'user123',
        type: 'reduce',
        target: 20,
        deadline: '2024-12-31',
        status: 'active',
        progress: 0
      });
      expect(redis.del).toHaveBeenCalledWith('user:goals:user123');
    });

    it('should throw error for missing userId', async () => {
      await expect(goalService.createGoal({
        type: 'reduce',
        target: 20,
        deadline: '2024-12-31'
      })).rejects.toThrow('User ID is required');
    });

    it('should throw error for missing type', async () => {
      await expect(goalService.createGoal({
        userId: 'user123',
        target: 20,
        deadline: '2024-12-31'
      })).rejects.toThrow('Goal type is required');
    });

    it('should throw error for missing target', async () => {
      await expect(goalService.createGoal({
        userId: 'user123',
        type: 'reduce',
        deadline: '2024-12-31'
      })).rejects.toThrow('Target is required');
    });

    it('should throw error for missing deadline', async () => {
      await expect(goalService.createGoal({
        userId: 'user123',
        type: 'reduce',
        target: 20
      })).rejects.toThrow('Deadline is required');
    });

    it('should throw error for invalid type', async () => {
      await expect(goalService.createGoal({
        userId: 'user123',
        type: 'invalid',
        target: 20,
        deadline: '2024-12-31'
      })).rejects.toThrow('Invalid goal type');
    });

    it('should throw error for invalid target', async () => {
      await expect(goalService.createGoal({
        userId: 'user123',
        type: 'reduce',
        target: -20,
        deadline: '2024-12-31'
      })).rejects.toThrow('Target must be positive');
    });

    it('should throw error for invalid deadline', async () => {
      await expect(goalService.createGoal({
        userId: 'user123',
        type: 'reduce',
        target: 20,
        deadline: '2020-12-31'
      })).rejects.toThrow('Deadline must be in the future');
    });

    it('should handle Airtable errors gracefully', async () => {
      const mockTable = mockAirtable.base().table('Goals');
      mockTable.create.mockRejectedValue(new Error('Airtable error'));

      await expect(goalService.createGoal({
        userId: 'user123',
        type: 'reduce',
        target: 20,
        deadline: '2024-12-31'
      })).rejects.toThrow('Airtable error');
    });

    it('should handle very large target values', async () => {
      const result = await goalService.createGoal(
        mockUser.id,
        'reduce_emissions',
        1000000,
        '2024-12-31'
      );

      expect(result.fields.target).toBe(1000000);
      expect(result.fields.progress).toBe(0);
    });

    it('should handle very small target values', async () => {
      const result = await goalService.createGoal(
        mockUser.id,
        'reduce_emissions',
        0.1,
        '2024-12-31'
      );

      expect(result.fields.target).toBe(0.1);
      expect(result.fields.progress).toBe(0);
    });

    it('should handle decimal target values', async () => {
      const result = await goalService.createGoal(
        mockUser.id,
        'reduce_emissions',
        10.5,
        '2024-12-31'
      );

      expect(result.fields.target).toBe(10.5);
      expect(result.fields.progress).toBe(0);
    });
  });

  describe('getUserGoals', () => {
    it('should get goals from cache if available', async () => {
      const mockGoals = [
        {
          id: 'rec123',
          fields: {
            userId: 'user123',
            type: 'reduce',
            target: 20,
            deadline: '2024-12-31',
            status: 'active',
            progress: 0
          }
        }
      ];

      redis.get.mockResolvedValue(JSON.stringify(mockGoals));

      const result = await goalService.getUserGoals('user123');

      expect(result).toEqual(mockGoals);
      expect(redis.get).toHaveBeenCalledWith('user:goals:user123');
      expect(mockAirtable.base().table).not.toHaveBeenCalled();
    });

    it('should get goals from Airtable if not in cache', async () => {
      const mockGoals = [
        {
          id: 'rec123',
          fields: {
            userId: 'user123',
            type: 'reduce',
            target: 20,
            deadline: '2024-12-31',
            status: 'active',
            progress: 0
          }
        }
      ];

      redis.get.mockResolvedValue(null);

      const mockTable = mockAirtable.base().table('Goals');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback(mockGoals, () => {});
        })
      });

      const result = await goalService.getUserGoals('user123');

      expect(result).toEqual(mockGoals);
      expect(redis.get).toHaveBeenCalledWith('user:goals:user123');
      expect(mockTable.select).toHaveBeenCalledWith({
        filterByFormula: "{userId} = 'user123'",
        sort: [{ field: 'deadline', direction: 'asc' }]
      });
      expect(redis.setex).toHaveBeenCalledWith(
        'user:goals:user123',
        300,
        JSON.stringify(mockGoals)
      );
    });

    it('should throw error for missing userId', async () => {
      await expect(goalService.getUserGoals(null))
        .rejects.toThrow('User ID is required');
    });

    it('should handle Airtable errors gracefully', async () => {
      redis.get.mockResolvedValue(null);

      const mockTable = mockAirtable.base().table('Goals');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          throw new Error('Airtable error');
        })
      });

      await expect(goalService.getUserGoals('user123'))
        .rejects.toThrow('Airtable error');
    });

    it('should handle empty goals list', async () => {
      redis.get.mockResolvedValue(null);
      mockAirtable.select().firstPage.mockResolvedValue([]);

      const result = await goalService.getUserGoals(mockUser.id);

      expect(result).toEqual([]);
      expect(redis.setex).toHaveBeenCalledWith(
        `user:goals:${mockUser.id}`,
        300,
        '[]'
      );
    });

    it('should handle invalid cached goals', async () => {
      redis.get.mockResolvedValue('invalid json');
      mockAirtable.select().firstPage.mockResolvedValue([mockGoal]);

      const result = await goalService.getUserGoals(mockUser.id);

      expect(result).toEqual([mockGoal]);
      expect(logger.warn).toHaveBeenCalledWith('Invalid cached user goals');
    });

    it('should handle Redis cache errors', async () => {
      redis.get.mockRejectedValue(new Error('Redis error'));
      mockAirtable.select().firstPage.mockResolvedValue([mockGoal]);

      const result = await goalService.getUserGoals(mockUser.id);

      expect(result).toEqual([mockGoal]);
      expect(logger.error).toHaveBeenCalledWith('Redis error when getting user goals');
    });
  });

  describe('updateGoalProgress', () => {
    it('should update goal progress successfully', async () => {
      const mockGoal = {
        id: 'rec123',
        fields: {
          userId: 'user123',
          type: 'reduce',
          target: 20,
          deadline: '2024-12-31',
          status: 'active',
          progress: 0
        }
      };

      const mockTable = mockAirtable.base().table('Goals');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([mockGoal], () => {});
        })
      });
      mockTable.update.mockResolvedValue({
        ...mockGoal,
        fields: {
          ...mockGoal.fields,
          progress: 50,
          status: 'in_progress'
        }
      });

      const result = await goalService.updateGoalProgress('rec123', 50);

      expect(result.fields.progress).toBe(50);
      expect(result.fields.status).toBe('in_progress');
      expect(mockTable.update).toHaveBeenCalledWith('rec123', {
        progress: 50,
        status: 'in_progress'
      });
      expect(redis.del).toHaveBeenCalledWith('user:goals:user123');
    });

    it('should throw error for missing goalId', async () => {
      await expect(goalService.updateGoalProgress(null, 50))
        .rejects.toThrow('Goal ID is required');
    });

    it('should throw error for missing progress', async () => {
      await expect(goalService.updateGoalProgress('rec123', null))
        .rejects.toThrow('Progress is required');
    });

    it('should throw error for invalid progress', async () => {
      await expect(goalService.updateGoalProgress('rec123', -10))
        .rejects.toThrow('Progress must be between 0 and 100');
    });

    it('should throw error for non-existent goal', async () => {
      const mockTable = mockAirtable.base().table('Goals');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([], () => {});
        })
      });

      await expect(goalService.updateGoalProgress('rec123', 50))
        .rejects.toThrow('Goal not found');
    });

    it('should handle Airtable errors gracefully', async () => {
      const mockGoal = {
        id: 'rec123',
        fields: {
          userId: 'user123',
          type: 'reduce',
          target: 20,
          deadline: '2024-12-31',
          status: 'active',
          progress: 0
        }
      };

      const mockTable = mockAirtable.base().table('Goals');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([mockGoal], () => {});
        })
      });
      mockTable.update.mockRejectedValue(new Error('Airtable error'));

      await expect(goalService.updateGoalProgress('rec123', 50))
        .rejects.toThrow('Airtable error');
    });

    it('should handle very large progress values', async () => {
      mockAirtable.find.mockResolvedValue(mockGoal);
      mockAirtable.update.mockResolvedValue({
        ...mockGoal,
        fields: {
          ...mockGoal.fields,
          progress: 1000000
        }
      });

      const result = await goalService.updateGoalProgress(mockGoal.id, 1000000);

      expect(result.fields.progress).toBe(1000000);
      expect(result.fields.status).toBe('completed');
    });

    it('should handle very small progress values', async () => {
      mockAirtable.find.mockResolvedValue(mockGoal);
      mockAirtable.update.mockResolvedValue({
        ...mockGoal,
        fields: {
          ...mockGoal.fields,
          progress: 0.1
        }
      });

      const result = await goalService.updateGoalProgress(mockGoal.id, 0.1);

      expect(result.fields.progress).toBe(0.1);
      expect(result.fields.status).toBe('in_progress');
    });

    it('should handle decimal progress values', async () => {
      mockAirtable.find.mockResolvedValue(mockGoal);
      mockAirtable.update.mockResolvedValue({
        ...mockGoal,
        fields: {
          ...mockGoal.fields,
          progress: 10.5
        }
      });

      const result = await goalService.updateGoalProgress(mockGoal.id, 10.5);

      expect(result.fields.progress).toBe(10.5);
      expect(result.fields.status).toBe('in_progress');
    });
  });

  describe('getGoalStats', () => {
    it('should get goal stats successfully', async () => {
      const mockGoals = [
        {
          id: 'rec123',
          fields: {
            userId: 'user123',
            type: 'reduce',
            target: 20,
            deadline: '2024-12-31',
            status: 'active',
            progress: 50
          }
        },
        {
          id: 'rec124',
          fields: {
            userId: 'user123',
            type: 'reduce',
            target: 30,
            deadline: '2024-12-31',
            status: 'completed',
            progress: 100
          }
        }
      ];

      const mockTable = mockAirtable.base().table('Goals');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback(mockGoals, () => {});
        })
      });

      const result = await goalService.getGoalStats('user123');

      expect(result).toEqual({
        total: 2,
        active: 1,
        completed: 1,
        averageProgress: 75
      });
      expect(mockTable.select).toHaveBeenCalledWith({
        filterByFormula: "{userId} = 'user123'"
      });
    });

    it('should throw error for missing userId', async () => {
      await expect(goalService.getGoalStats(null))
        .rejects.toThrow('User ID is required');
    });

    it('should handle Airtable errors gracefully', async () => {
      const mockTable = mockAirtable.base().table('Goals');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          throw new Error('Airtable error');
        })
      });

      await expect(goalService.getGoalStats('user123'))
        .rejects.toThrow('Airtable error');
    });

    it('should handle empty goals list', async () => {
      mockAirtable.select().firstPage.mockResolvedValue([]);

      const result = await goalService.getGoalStats(mockUser.id);

      expect(result).toEqual({
        total: 0,
        completed: 0,
        inProgress: 0,
        failed: 0,
        averageProgress: 0
      });
    });

    it('should handle goals with zero progress', async () => {
      mockAirtable.select().firstPage.mockResolvedValue([
        {
          ...mockGoal,
          fields: {
            ...mockGoal.fields,
            progress: 0
          }
        }
      ]);

      const result = await goalService.getGoalStats(mockUser.id);

      expect(result.averageProgress).toBe(0);
    });

    it('should handle Airtable errors', async () => {
      mockAirtable.select().firstPage.mockRejectedValue(new Error('Airtable error'));

      await expect(goalService.getGoalStats(mockUser.id))
        .rejects.toThrow('Airtable error');
    });
  });

  describe('updateCustomGoalProgress', () => {
    it('should update custom goal progress successfully', async () => {
      const mockGoal = {
        id: 'rec123',
        fields: {
          userId: 'user123',
          type: 'custom',
          target: 20,
          deadline: '2024-12-31',
          status: 'active',
          progress: 0
        }
      };

      const mockTable = mockAirtable.base().table('Goals');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([mockGoal], () => {});
        })
      });
      mockTable.update.mockResolvedValue({
        ...mockGoal,
        fields: {
          ...mockGoal.fields,
          progress: 50,
          status: 'in_progress'
        }
      });

      const result = await goalService.updateCustomGoalProgress('rec123', 50);

      expect(result.fields.progress).toBe(50);
      expect(result.fields.status).toBe('in_progress');
      expect(mockTable.update).toHaveBeenCalledWith('rec123', {
        progress: 50,
        status: 'in_progress'
      });
      expect(redis.del).toHaveBeenCalledWith('user:goals:user123');
    });

    it('should throw error for missing goalId', async () => {
      await expect(goalService.updateCustomGoalProgress(null, 50))
        .rejects.toThrow('Goal ID is required');
    });

    it('should throw error for missing progress', async () => {
      await expect(goalService.updateCustomGoalProgress('rec123', null))
        .rejects.toThrow('Progress is required');
    });

    it('should throw error for invalid progress', async () => {
      await expect(goalService.updateCustomGoalProgress('rec123', -10))
        .rejects.toThrow('Progress must be between 0 and 100');
    });

    it('should throw error for non-existent goal', async () => {
      const mockTable = mockAirtable.base().table('Goals');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([], () => {});
        })
      });

      await expect(goalService.updateCustomGoalProgress('rec123', 50))
        .rejects.toThrow('Goal not found');
    });

    it('should throw error for non-custom goal', async () => {
      const mockGoal = {
        id: 'rec123',
        fields: {
          userId: 'user123',
          type: 'reduce',
          target: 20,
          deadline: '2024-12-31',
          status: 'active',
          progress: 0
        }
      };

      const mockTable = mockAirtable.base().table('Goals');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([mockGoal], () => {});
        })
      });

      await expect(goalService.updateCustomGoalProgress('rec123', 50))
        .rejects.toThrow('Goal is not a custom goal');
    });

    it('should handle Airtable errors gracefully', async () => {
      const mockGoal = {
        id: 'rec123',
        fields: {
          userId: 'user123',
          type: 'custom',
          target: 20,
          deadline: '2024-12-31',
          status: 'active',
          progress: 0
        }
      };

      const mockTable = mockAirtable.base().table('Goals');
      mockTable.select.mockReturnValue({
        eachPage: jest.fn().mockImplementation((pageCallback) => {
          pageCallback([mockGoal], () => {});
        })
      });
      mockTable.update.mockRejectedValue(new Error('Airtable error'));

      await expect(goalService.updateCustomGoalProgress('rec123', 50))
        .rejects.toThrow('Airtable error');
    });
  });
}); 