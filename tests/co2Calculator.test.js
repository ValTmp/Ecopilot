// @KI-GEN-START [2025-04-06]
const CO2Calculator = require('../src/services/co2Calculator');
const redis = require('../src/config/redis');
const Airtable = require('airtable');
const logger = require('../src/services/logger');

// Mock Redis
jest.mock('../src/config/redis', () => ({
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  flushall: jest.fn()
}));

// Mock Airtable
jest.mock('airtable', () => ({
  base: jest.fn().mockReturnValue({
    table: jest.fn().mockReturnValue({
      create: jest.fn(),
      select: jest.fn().mockReturnValue({
        filterByFormula: jest.fn().mockReturnThis(),
        firstPage: jest.fn()
      })
    })
  })
}));

// Mock logger
jest.mock('../src/services/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('CO2Calculator', () => {
  let co2Calculator;
  let mockAirtable;
  let mockUser;
  let mockCalculation;

  beforeEach(() => {
    co2Calculator = new CO2Calculator();
    mockAirtable = Airtable.base().table('CO2Calculations');
    mockUser = {
      id: 'user123',
      email: 'test@example.com'
    };

    mockCalculation = {
      id: 'calc123',
      fields: {
        userId: mockUser.id,
        transportType: 'car',
        distance: 100,
        emissions: 25.5,
        createdAt: new Date().toISOString()
      }
    };

    jest.clearAllMocks();
  });

  describe('calculateEmissions', () => {
    it('should calculate emissions for car transport', async () => {
      const result = await co2Calculator.calculateEmissions('car', 100);
      expect(result).toBe(23); // 0.23 kg CO2/km * 100 km
    });

    it('should calculate emissions for plane transport', async () => {
      const result = await co2Calculator.calculateEmissions('plane', 1000);
      expect(result).toBe(255); // 0.255 kg CO2/km * 1000 km
    });

    it('should calculate emissions for public transport', async () => {
      const result = await co2Calculator.calculateEmissions('public', 50);
      expect(result).toBe(2.5); // 0.05 kg CO2/km * 50 km
    });

    it('should throw error for invalid transport type', async () => {
      await expect(co2Calculator.calculateEmissions('invalid', 100))
        .rejects.toThrow('Invalid transport type');
    });

    it('should throw error for negative distance', async () => {
      await expect(co2Calculator.calculateEmissions('car', -100))
        .rejects.toThrow('Distance must be positive');
    });

    it('should throw error for zero distance', async () => {
      await expect(co2Calculator.calculateEmissions('car', 0))
        .rejects.toThrow('Distance must be positive');
    });

    it('should handle very large distances', async () => {
      const result = await co2Calculator.calculateEmissions('car', 1000000);
      expect(result).toBe(230000); // 0.23 kg CO2/km * 1000000 km
    });

    it('should handle very small distances', async () => {
      const result = await co2Calculator.calculateEmissions('car', 0.1);
      expect(result).toBe(0.023); // 0.23 kg CO2/km * 0.1 km
    });

    it('should handle decimal distances', async () => {
      const result = await co2Calculator.calculateEmissions('car', 10.5);
      expect(result).toBe(2.415); // 0.23 kg CO2/km * 10.5 km
    });
  });

  describe('getEmissionFactors', () => {
    it('should get emission factors from cache if available', async () => {
      const mockFactors = {
        car: 0.23,
        plane: 0.255,
        public: 0.05
      };

      redis.get.mockResolvedValue(JSON.stringify(mockFactors));

      const result = await co2Calculator.getEmissionFactors();

      expect(result).toEqual(mockFactors);
      expect(redis.get).toHaveBeenCalledWith('co2:emission_factors');
    });

    it('should get emission factors from service if not in cache', async () => {
      redis.get.mockResolvedValue(null);

      const result = await co2Calculator.getEmissionFactors();

      expect(result).toEqual({
        car: 0.23,
        plane: 0.255,
        public: 0.05
      });
      expect(redis.setex).toHaveBeenCalledWith(
        'co2:emission_factors',
        3600,
        expect.any(String)
      );
    });

    it('should handle Redis errors gracefully', async () => {
      redis.get.mockRejectedValue(new Error('Redis error'));
      
      const result = await co2Calculator.getEmissionFactors();
      
      expect(result).toEqual({
        car: 0.23,
        plane: 0.255,
        public: 0.05
      });
      expect(logger.error).toHaveBeenCalledWith('Redis error when getting emission factors');
    });

    it('should handle invalid cached data', async () => {
      redis.get.mockResolvedValue('invalid json');
      
      const result = await co2Calculator.getEmissionFactors();
      
      expect(result).toEqual({
        car: 0.23,
        plane: 0.255,
        public: 0.05
      });
      expect(logger.warn).toHaveBeenCalledWith('Invalid cached emission factors');
    });
  });

  describe('saveCalculation', () => {
    it('should save calculation successfully', async () => {
      mockAirtable.create.mockResolvedValue(mockCalculation);

      const result = await co2Calculator.saveCalculation(
        mockUser.id,
        'car',
        100,
        25.5
      );

      expect(result).toEqual(mockCalculation);
      expect(mockAirtable.create).toHaveBeenCalledWith({
        userId: mockUser.id,
        transportType: 'car',
        distance: 100,
        emissions: 25.5,
        createdAt: expect.any(String)
      });
      expect(redis.del).toHaveBeenCalledWith(`user:co2:${mockUser.id}`);
    });

    it('should handle missing parameters', async () => {
      await expect(co2Calculator.saveCalculation()).rejects.toThrow('Missing required parameters');
      await expect(co2Calculator.saveCalculation(mockUser.id)).rejects.toThrow('Missing required parameters');
      await expect(co2Calculator.saveCalculation(mockUser.id, 'car')).rejects.toThrow('Missing required parameters');
      await expect(co2Calculator.saveCalculation(mockUser.id, 'car', 100)).rejects.toThrow('Missing required parameters');
    });

    it('should handle invalid transport type', async () => {
      await expect(co2Calculator.saveCalculation(
        mockUser.id,
        'invalid',
        100,
        25.5
      )).rejects.toThrow('Invalid transport type');
    });

    it('should handle invalid distance', async () => {
      await expect(co2Calculator.saveCalculation(
        mockUser.id,
        'car',
        -100,
        25.5
      )).rejects.toThrow('Distance must be positive');
    });

    it('should handle Airtable errors', async () => {
      mockAirtable.create.mockRejectedValue(new Error('Airtable error'));

      await expect(co2Calculator.saveCalculation(
        mockUser.id,
        'car',
        100,
        25.5
      )).rejects.toThrow('Airtable error');
    });

    it('should handle very large emissions values', async () => {
      mockAirtable.create.mockResolvedValue({
        ...mockCalculation,
        fields: {
          ...mockCalculation.fields,
          emissions: 1000000
        }
      });

      const result = await co2Calculator.saveCalculation(
        mockUser.id,
        'plane',
        1000000,
        1000000
      );

      expect(result.fields.emissions).toBe(1000000);
    });

    it('should handle Redis cache invalidation errors', async () => {
      mockAirtable.create.mockResolvedValue(mockCalculation);
      redis.del.mockRejectedValue(new Error('Redis error'));

      const result = await co2Calculator.saveCalculation(
        mockUser.id,
        'car',
        100,
        25.5
      );

      expect(result).toEqual(mockCalculation);
      expect(logger.error).toHaveBeenCalledWith('Redis error when invalidating cache');
    });
  });

  describe('getUserHistory', () => {
    it('should get user history from cache if available', async () => {
      const mockHistory = [mockCalculation];
      redis.get.mockResolvedValue(JSON.stringify(mockHistory));

      const result = await co2Calculator.getUserHistory(mockUser.id);

      expect(result).toEqual(mockHistory);
      expect(redis.get).toHaveBeenCalledWith(`user:co2:${mockUser.id}`);
      expect(mockAirtable.select).not.toHaveBeenCalled();
    });

    it('should get user history from Airtable if not in cache', async () => {
      const mockHistory = [mockCalculation];
      redis.get.mockResolvedValue(null);
      mockAirtable.select().firstPage.mockResolvedValue(mockHistory);

      const result = await co2Calculator.getUserHistory(mockUser.id);

      expect(result).toEqual(mockHistory);
      expect(redis.get).toHaveBeenCalledWith(`user:co2:${mockUser.id}`);
      expect(mockAirtable.select).toHaveBeenCalled();
      expect(mockAirtable.select().filterByFormula).toHaveBeenCalledWith(
        `{userId} = '${mockUser.id}'`
      );
      expect(redis.setex).toHaveBeenCalledWith(
        `user:co2:${mockUser.id}`,
        300,
        JSON.stringify(mockHistory)
      );
    });

    it('should handle missing userId', async () => {
      await expect(co2Calculator.getUserHistory()).rejects.toThrow('Missing userId');
    });

    it('should handle Airtable errors', async () => {
      redis.get.mockResolvedValue(null);
      mockAirtable.select().firstPage.mockRejectedValue(new Error('Airtable error'));

      await expect(co2Calculator.getUserHistory(mockUser.id)).rejects.toThrow('Airtable error');
    });

    it('should handle empty history', async () => {
      redis.get.mockResolvedValue(null);
      mockAirtable.select().firstPage.mockResolvedValue([]);

      const result = await co2Calculator.getUserHistory(mockUser.id);

      expect(result).toEqual([]);
      expect(redis.setex).toHaveBeenCalledWith(
        `user:co2:${mockUser.id}`,
        300,
        '[]'
      );
    });

    it('should handle invalid cached history', async () => {
      redis.get.mockResolvedValue('invalid json');
      mockAirtable.select().firstPage.mockResolvedValue([mockCalculation]);

      const result = await co2Calculator.getUserHistory(mockUser.id);

      expect(result).toEqual([mockCalculation]);
      expect(logger.warn).toHaveBeenCalledWith('Invalid cached user history');
    });

    it('should handle Redis cache errors', async () => {
      redis.get.mockRejectedValue(new Error('Redis error'));
      mockAirtable.select().firstPage.mockResolvedValue([mockCalculation]);

      const result = await co2Calculator.getUserHistory(mockUser.id);

      expect(result).toEqual([mockCalculation]);
      expect(logger.error).toHaveBeenCalledWith('Redis error when getting user history');
    });
  });
});
// @KI-GEN-END 