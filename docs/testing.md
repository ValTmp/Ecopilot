# EcoPilot Testing Guide

This guide explains how to test the EcoPilot application using various testing methodologies.

## Testing Stack

EcoPilot uses the following testing tools:

- **Jest**: JavaScript testing framework
- **Supertest**: HTTP assertions library for testing API endpoints
- **Redis-Mock**: Redis mock for testing cache functionality
- **Airtable-Mock**: Custom mock for Airtable integration

## Test Types

### 1. Unit Tests

Unit tests verify that individual functions and components work as expected in isolation.

#### Running Unit Tests

```bash
# Run all unit tests
npm test

# Run specific test file
npm test -- tests/unit/co2Calculator.test.js

# Run tests with a specific name pattern
npm test -- -t "saveCalculation"
```

### 2. Integration Tests

Integration tests verify that components work together correctly.

#### Running Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific integration test
npm test -- tests/integration/co2Routes.test.js
```

### 3. API Tests

API tests verify that the API endpoints work as expected with actual HTTP requests.

#### Running API Tests

```bash
# Run all API tests
npm run test:api
```

### 4. End-to-End Tests

End-to-end tests simulate real user scenarios and test the entire application flow.

#### Running E2E Tests

```bash
# Run all E2E tests
npm run test:e2e
```

## Test Environment Setup

### Setting Up Test Environment

1. Create a `.env.test` file with test environment variables:
   ```
   NODE_ENV=test
   PORT=3001
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=test-jwt-secret
   JWT_REFRESH_SECRET=test-jwt-refresh-secret
   ```

2. Install testing dependencies:
   ```bash
   npm install --save-dev jest supertest redis-mock
   ```

3. Ensure Redis is running for integration tests:
   ```bash
   # Check if Redis is running
   redis-cli ping
   
   # Start Redis if it's not running
   redis-server
   ```

## Writing Tests

### Unit Test Example

```javascript
// tests/unit/co2Calculator.test.js
const co2Calculator = require('../../src/services/co2Calculator');

describe('CO2 Calculator', () => {
  describe('calculateCO2', () => {
    it('should calculate CO2 emissions for car transport', () => {
      const result = co2Calculator.calculateCO2('car', 100);
      expect(result).toBe(25); // 100 km * 0.25 kg/km
    });
    
    it('should calculate CO2 emissions for plane transport', () => {
      const result = co2Calculator.calculateCO2('plane', 100);
      expect(result).toBe(40); // 100 km * 0.40 kg/km
    });
    
    it('should calculate CO2 emissions for public transport', () => {
      const result = co2Calculator.calculateCO2('public', 100);
      expect(result).toBe(10); // 100 km * 0.10 kg/km
    });
    
    it('should throw an error for invalid transport type', () => {
      expect(() => co2Calculator.calculateCO2('invalid', 100)).toThrow();
    });
  });
});
```

### Integration Test Example

```javascript
// tests/integration/co2Routes.test.js
const request = require('supertest');
const app = require('../../src/app');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;

describe('CO2 Routes', () => {
  let authToken;
  
  beforeAll(() => {
    // Create a test token
    authToken = jwt.sign({ id: 'test-user', email: 'test@example.com' }, JWT_SECRET);
  });
  
  describe('POST /api/co2/calculate', () => {
    it('should calculate CO2 emissions for a valid request', async () => {
      const response = await request(app)
        .post('/api/co2/calculate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transportType: 'car',
          distance: 100
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('emissions', 25);
      expect(response.body).toHaveProperty('unit', 'kg');
      expect(response.body).toHaveProperty('transportType', 'car');
      expect(response.body).toHaveProperty('distance', 100);
    });
    
    it('should return 400 for invalid input', async () => {
      const response = await request(app)
        .post('/api/co2/calculate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transportType: 'invalid',
          distance: 100
        });
      
      expect(response.status).toBe(400);
    });
    
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/co2/calculate')
        .send({
          transportType: 'car',
          distance: 100
        });
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('GET /api/co2/factors', () => {
    it('should return emission factors', async () => {
      const response = await request(app)
        .get('/api/co2/factors');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('car');
      expect(response.body).toHaveProperty('plane');
      expect(response.body).toHaveProperty('public');
    });
  });
});
```

### Mocking Dependencies

#### Redis Mocking

```javascript
// tests/unit/cache.test.js
jest.mock('ioredis', () => require('ioredis-mock'));
const cache = require('../../src/config/redis');

describe('Redis Cache', () => {
  beforeEach(async () => {
    await cache.client.flushall();
  });
  
  it('should set and get a value', async () => {
    await cache.set('test-key', 'test-value');
    const value = await cache.get('test-key');
    expect(value).toBe('test-value');
  });
  
  it('should delete a value', async () => {
    await cache.set('test-key', 'test-value');
    await cache.del('test-key');
    const value = await cache.get('test-key');
    expect(value).toBeNull();
  });
});
```

#### Airtable Mocking

```javascript
// tests/mocks/airtable.js
const airtableMock = {
  base: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      firstPage: jest.fn().mockResolvedValue([
        {
          id: 'rec123',
          fields: {
            User_ID: 'test-user',
            Transport_Type: 'car',
            Distance: 100,
            CO2_Emissions: 25,
            Date: '2025-04-01T12:00:00Z'
          }
        }
      ])
    }),
    create: jest.fn().mockResolvedValue([
      {
        id: 'rec456',
        fields: {
          User_ID: 'test-user',
          Transport_Type: 'car',
          Distance: 100,
          CO2_Emissions: 25,
          Date: '2025-04-01T12:00:00Z'
        }
      }
    ])
  })
};

module.exports = airtableMock;
```

Then use it in your tests:

```javascript
// tests/unit/co2Calculator.test.js
jest.mock('airtable', () => require('../mocks/airtable'));
const co2Calculator = require('../../src/services/co2Calculator');

describe('saveCalculation', () => {
  it('should save a calculation to Airtable', async () => {
    const result = await co2Calculator.saveCalculation('test-user', 'car', 100, 25);
    expect(result).toHaveProperty('id', 'rec456');
  });
});
```

## Test Coverage

Track test coverage to ensure all code paths are tested:

```bash
# Run tests with coverage report
npm test -- --coverage
```

Target coverage thresholds:
- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%

## Continuous Integration

Tests are automatically run on GitHub Actions for every pull request and push to main branches.

### CI Workflow

1. Push code to a feature branch
2. Create a pull request
3. GitHub Actions automatically runs tests
4. If tests pass, the PR can be reviewed and merged
5. After merging, tests run again on the target branch

## Best Practices

1. **Test Isolation**: Each test should be independent and not rely on the state from other tests
2. **Clean Setup and Teardown**: Properly set up and clean up resources before and after tests
3. **Meaningful Assertions**: Make assertions that check the actual behavior, not implementation details
4. **Test Edge Cases**: Include tests for error conditions, boundary values, and edge cases
5. **Keep Tests Fast**: Optimize tests to run quickly to provide fast feedback
6. **Use Descriptive Names**: Give tests meaningful names that describe what they are testing 