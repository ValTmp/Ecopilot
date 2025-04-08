const logger = require('../src/services/logger');
const winston = require('winston');

// Mock winston
jest.mock('winston', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    co2: jest.fn()
  }),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    printf: jest.fn(),
    colorize: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

describe('Logger Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('info', () => {
    it('should log info message', () => {
      const message = 'Test info message';
      logger.info(message);

      expect(logger.logger.info).toHaveBeenCalledWith(message);
    });

    it('should log info message with metadata', () => {
      const message = 'Test info message';
      const metadata = { userId: 'user123', action: 'login' };
      logger.info(message, metadata);

      expect(logger.logger.info).toHaveBeenCalledWith(message, metadata);
    });
  });

  describe('error', () => {
    it('should log error message', () => {
      const message = 'Test error message';
      logger.error(message);

      expect(logger.logger.error).toHaveBeenCalledWith(message);
    });

    it('should log error message with metadata', () => {
      const message = 'Test error message';
      const metadata = { userId: 'user123', error: 'Database error' };
      logger.error(message, metadata);

      expect(logger.logger.error).toHaveBeenCalledWith(message, metadata);
    });

    it('should log error object', () => {
      const error = new Error('Test error');
      logger.error(error);

      expect(logger.logger.error).toHaveBeenCalledWith(error);
    });
  });

  describe('warn', () => {
    it('should log warning message', () => {
      const message = 'Test warning message';
      logger.warn(message);

      expect(logger.logger.warn).toHaveBeenCalledWith(message);
    });

    it('should log warning message with metadata', () => {
      const message = 'Test warning message';
      const metadata = { userId: 'user123', reason: 'Rate limit approaching' };
      logger.warn(message, metadata);

      expect(logger.logger.warn).toHaveBeenCalledWith(message, metadata);
    });
  });

  describe('debug', () => {
    it('should log debug message', () => {
      const message = 'Test debug message';
      logger.debug(message);

      expect(logger.logger.debug).toHaveBeenCalledWith(message);
    });

    it('should log debug message with metadata', () => {
      const message = 'Test debug message';
      const metadata = { userId: 'user123', details: 'Request processing' };
      logger.debug(message, metadata);

      expect(logger.logger.debug).toHaveBeenCalledWith(message, metadata);
    });
  });

  describe('co2', () => {
    it('should log CO2 calculation', () => {
      const message = 'CO2 calculation completed';
      logger.co2(message);

      expect(logger.logger.co2).toHaveBeenCalledWith(message);
    });

    it('should log CO2 calculation with metadata', () => {
      const message = 'CO2 calculation completed';
      const metadata = {
        userId: 'user123',
        transportType: 'car',
        distance: 100,
        emissions: 23
      };
      logger.co2(message, metadata);

      expect(logger.logger.co2).toHaveBeenCalledWith(message, metadata);
    });
  });

  describe('logger configuration', () => {
    it('should create logger with correct format', () => {
      expect(winston.format.combine).toHaveBeenCalled();
      expect(winston.format.timestamp).toHaveBeenCalled();
      expect(winston.format.printf).toHaveBeenCalled();
      expect(winston.format.colorize).toHaveBeenCalled();
    });

    it('should create logger with correct transports', () => {
      expect(winston.transports.Console).toHaveBeenCalled();
      expect(winston.transports.File).toHaveBeenCalledWith({
        filename: 'logs/error.log',
        level: 'error'
      });
      expect(winston.transports.File).toHaveBeenCalledWith({
        filename: 'logs/combined.log'
      });
    });

    it('should create logger with custom CO2 level', () => {
      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          levels: expect.objectContaining({
            co2: 0
          })
        })
      );
    });
  });
}); 