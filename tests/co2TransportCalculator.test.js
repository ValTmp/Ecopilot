// @KI-GEN-START [2025-04-06]
const { calculateCO2 } = require('../src/services/co2Calculator');

describe('CO2 Transport Calculator', () => {
  describe('calculateCO2', () => {
    // Test valid inputs
    test('should calculate CO2 emissions for car correctly', () => {
      expect(calculateCO2('car', 100)).toBe(20); // 100 km * 0.2 kg/km = 20 kg
    });

    test('should calculate CO2 emissions for plane correctly', () => {
      expect(calculateCO2('plane', 1000)).toBe(300); // 1000 km * 0.3 kg/km = 300 kg
    });

    test('should calculate CO2 emissions for public transit correctly', () => {
      expect(calculateCO2('public', 50)).toBe(2.5); // 50 km * 0.05 kg/km = 2.5 kg
    });

    // Test invalid inputs
    test('should throw an error for invalid transport type', () => {
      expect(() => calculateCO2('bicycle', 100)).toThrow('Invalid transport type');
    });

    test('should throw an error for negative distance', () => {
      expect(() => calculateCO2('car', -10)).toThrow('Distance must be a positive number');
    });

    test('should throw an error for zero distance', () => {
      expect(() => calculateCO2('car', 0)).toThrow('Distance must be a positive number');
    });

    test('should throw an error for non-numeric distance', () => {
      expect(() => calculateCO2('car', 'hundred')).toThrow('Distance must be a number');
      expect(() => calculateCO2('car', NaN)).toThrow('Distance must be a number');
    });

    // Test edge cases
    test('should handle very large distances', () => {
      expect(calculateCO2('car', 1000000)).toBe(200000); // 1,000,000 km * 0.2 kg/km = 200,000 kg
    });
  });
});
// @KI-GEN-END 