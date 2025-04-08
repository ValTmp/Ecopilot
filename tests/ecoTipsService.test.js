/**
 * Tests for the EcoTips Service
 */

const redis = require('ioredis-mock');
const { jest } = require('@jest/globals');

// Mock dependencies
jest.mock('../src/config/redis', () => {
  return new (require('ioredis-mock'))();
});

jest.mock('../src/services/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn()
}));

jest.mock('../src/services/monitoring', () => ({
  trackCacheHit: jest.fn(),
  trackCacheMiss: jest.fn(),
  trackResponseTime: jest.fn(),
  trackError: jest.fn()
}));

// Import the service after mocking dependencies
const ecoTipsService = require('../src/services/ecoTipsService');
const monitoring = require('../src/services/monitoring');
const redisMock = require('../src/config/redis');

describe('EcoTips Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisMock.flushall();
  });

  describe('getPersonalizedTips', () => {
    test('should return personalized tips for car transportation', async () => {
      const tips = await ecoTipsService.getPersonalizedTips('user123', 'car', 50);
      
      expect(tips).toHaveLength(3);
      expect(monitoring.trackCacheMiss).toHaveBeenCalledWith('eco_tips');
      
      // Verify tips are from the car category
      expect(tips.some(tip => tip.id.startsWith('car-'))).toBe(true);
    });

    test('should return personalized tips for plane transportation', async () => {
      const tips = await ecoTipsService.getPersonalizedTips('user123', 'plane', 500);
      
      expect(tips).toHaveLength(3);
      expect(monitoring.trackCacheMiss).toHaveBeenCalledWith('eco_tips');
      
      // Verify tips contain distance tip for long journeys
      const hasDistanceTip = tips.some(tip => tip.id === 'distance-1');
      expect(hasDistanceTip).toBe(true);
    });

    test('should return personalized tips for short distances', async () => {
      const tips = await ecoTipsService.getPersonalizedTips('user123', 'car', 3);
      
      expect(tips).toHaveLength(3);
      expect(monitoring.trackCacheMiss).toHaveBeenCalledWith('eco_tips');
      
      // Verify tips contain distance tip for short journeys
      const hasShortDistanceTip = tips.some(tip => tip.id === 'distance-2');
      expect(hasShortDistanceTip).toBe(true);
    });

    test('should return tips from cache if available', async () => {
      // First call should miss cache
      await ecoTipsService.getPersonalizedTips('user123', 'public', 10);
      expect(monitoring.trackCacheMiss).toHaveBeenCalledTimes(1);
      
      // Second call should hit cache
      await ecoTipsService.getPersonalizedTips('user123', 'public', 10);
      expect(monitoring.trackCacheHit).toHaveBeenCalledTimes(1);
    });

    test('should handle invalid transport type gracefully', async () => {
      const tips = await ecoTipsService.getPersonalizedTips('user123', 'invalid', 50);
      
      expect(tips).toHaveLength(3);
      // Should only include general tips if transport type is invalid
      tips.forEach(tip => {
        expect(tip.id.startsWith('general-')).toBe(true);
      });
    });

    test('should handle redis errors gracefully', async () => {
      // Mock redis.get to throw an error
      const originalGet = redisMock.get;
      redisMock.get = jest.fn().mockRejectedValue(new Error('Redis error'));
      
      // Service should handle the error and return general tips
      const tips = await ecoTipsService.getPersonalizedTips('user123', 'car', 50);
      
      expect(tips).toEqual(ecoTipsService.TRANSPORT_TIPS.general);
      expect(monitoring.trackError).toHaveBeenCalledWith('ecoTips', 'GetTipsError', 'Redis error');
      
      // Restore original implementation
      redisMock.get = originalGet;
    });
  });

  describe('getTipsByCategory', () => {
    test('should return tips for a specific category', () => {
      const planningTips = ecoTipsService.getTipsByCategory('planning');
      
      expect(planningTips.length).toBeGreaterThan(0);
      planningTips.forEach(tip => {
        expect(tip.category).toBe('planning');
      });
    });

    test('should return empty array for non-existent category', () => {
      const nonExistentTips = ecoTipsService.getTipsByCategory('non-existent');
      expect(nonExistentTips).toEqual([]);
    });
  });

  describe('getTipCategories', () => {
    test('should return all unique tip categories', () => {
      const categories = ecoTipsService.getTipCategories();
      
      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain('planning');
      expect(categories).toContain('behavioral');
      expect(categories).toContain('investment');
      
      // Check for duplicates
      const uniqueCategories = new Set(categories);
      expect(uniqueCategories.size).toBe(categories.length);
    });
  });
}); 