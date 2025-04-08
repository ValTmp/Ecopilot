// @KI-GEN-START [2025-04-06]
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { co2CalculatorLimiter } = require('../middleware/security');
const co2Calculator = require('../services/co2Calculator');

const router = express.Router();

/**
 * @route POST /api/co2/calculate
 * @desc Calculate CO2 emissions for a given transport type and distance
 * @access Private
 */
router.post('/calculate',
  co2CalculatorLimiter,
  authenticate,
  validateRequest('co2Calculation'),
  async (req, res, next) => {
    try {
      const { transportType, distance } = req.body;
      
      // Convert distance to number if needed
      const distanceValue = typeof distance === 'string' ? parseFloat(distance) : distance;
      
      // Calculate emissions
      const emissions = co2Calculator.calculateCO2(transportType, distanceValue);
      
      // Return result
      res.status(200).json({ 
        emissions,
        unit: 'kg',
        transportType,
        distance: distanceValue
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/co2/factors
 * @desc Get emission factors for different transport types
 * @access Public
 */
router.get('/factors', (req, res) => {
  // Get the emission factors from the CO2 calculator service
  const EMISSION_FACTORS = {
    car: 0.2,     // 0.2 kg CO2 per km
    plane: 0.3,   // 0.3 kg CO2 per km
    public: 0.05  // 0.05 kg CO2 per km
  };
  
  res.json({
    factors: EMISSION_FACTORS,
    unit: 'kg/km',
    description: 'CO2 emission factors for different transport types'
  });
});

/**
 * @route GET /api/co2/history
 * @desc Get a user's CO2 calculation history
 * @access Private
 */
router.get('/history',
  authenticate,
  async (req, res, next) => {
    try {
      const history = await co2Calculator.CO2Calculator.getUserHistory(req.user.id);
      res.json(history);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
// @KI-GEN-END 