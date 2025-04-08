# CO2 Calculation API with Redis Caching

This document outlines the CO2 calculation API endpoints with Redis caching implementation for the EcoPilot platform.

## Overview

This API provides endpoints for calculating CO2 emissions, retrieving emission factors, and viewing CO2 calculation history. It utilizes Redis caching to enhance performance and reduce database load.

## Endpoints

### 1. Calculate CO2 Emissions

**Endpoint:** `POST /api/co2/calculate`

**Description:**  
Calculate the CO2 emissions for a given transport type and distance.

**Request Body:**
```json
{
  "userId": "string",
  "transportType": "string",
  "distance": "number"
}
```

**Response:**
```json
{
  "id": "string",
  "userId": "string",
  "transportType": "string",
  "distance": "number",
  "co2Impact": "number",
  "date": "string"
}
```

**Error Responses:**
- 400: Bad Request - Missing or invalid parameters
- 401: Unauthorized - Missing or invalid token
- 429: Too Many Requests - Rate limit exceeded
- 500: Internal Server Error - Server-side error

### 2. Get Emission Factors

**Endpoint:** `GET /api/co2/factors`

**Description:**  
Retrieve cached emission factors for different transportation types.

**Response:**
```json
{
  "success": true,
  "data": {
    "car": "number",
    "plane": "number",
    "public": "number"
  }
}
```

**Headers:**
- `X-Cache: HIT` when served from Redis cache
- `X-Cache: MISS` when fetched from data source
- `Cache-Control: private, max-age=3600` for browser caching (1 hour)

**Error Responses:**
- 500: Internal Server Error - Failed to retrieve factors

### 3. Get User CO2 History

**Endpoint:** `GET /api/co2/history/:userId`

**Description:**  
Retrieve a user's CO2 calculation history.

**Parameters:**
- `userId`: ID of the user whose history is being requested

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "userId": "string",
      "transportType": "string",
      "distance": "number",
      "co2Impact": "number",
      "date": "string"
    }
  ]
}
```

**Headers:**
- `X-Cache: HIT` when served from Redis cache
- `X-Cache: MISS` when fetched from data source

**Error Responses:**
- 401: Unauthorized - Missing or invalid token
- 403: Forbidden - Not authorized to view requested user's history
- 500: Internal Server Error - Failed to fetch history

### 4. Get Personalized Eco Tips

**Endpoint:** `GET /api/co2/tips`

**Description:**  
Retrieve personalized eco tips based on transport type and travel distance to help reduce carbon footprint.

**Query Parameters:**
- `userId`: ID of the user requesting tips
- `transportType`: Type of transport (car, plane, public)
- `distance`: Distance traveled in kilometers

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "tip": "string",
      "impact": "string",
      "category": "string"
    }
  ]
}
```

**Headers:**
- `X-Cache: HIT` when served from Redis cache
- `X-Cache: MISS` when fetched and newly generated

**Error Responses:**
- 400: Bad Request - Missing or invalid parameters
- 401: Unauthorized - Missing or invalid token
- 429: Too Many Requests - Rate limit exceeded
- 500: Internal Server Error - Failed to retrieve tips

### 5. Get Tip Categories

**Endpoint:** `GET /api/co2/tip-categories`

**Description:**  
Retrieve all available eco tip categories.

**Response:**
```json
{
  "success": true,
  "data": ["string"]
}
```

**Error Responses:**
- 500: Internal Server Error - Failed to retrieve categories

### 6. Get Favorite Eco Tips

**Endpoint:** `GET /api/co2/favorite-tips/:userId`

**Description:**  
Retrieve a user's favorite eco tips.

**Parameters:**
- `userId`: ID of the user whose favorite tips are being requested

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "tip": "string",
      "impact": "string",
      "category": "string"
    }
  ]
}
```

**Error Responses:**
- 401: Unauthorized - Missing or invalid token
- 403: Forbidden - Not authorized to access requested user's favorites
- 500: Internal Server Error - Failed to retrieve favorites

### 7. Add Tip to Favorites

**Endpoint:** `POST /api/co2/favorite-tips/:userId`

**Description:**  
Add an eco tip to user's favorites. There is a limit of 50 favorites per user. When this limit is reached, the oldest favorite will be automatically removed.

**Parameters:**
- `userId`: ID of the user 

**Request Body:**
```json
{
  "tipId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tip added to favorites"
}
```

**Error Responses:**
- 400: Bad Request - Missing tip ID or invalid tip ID
- 401: Unauthorized - Missing or invalid token
- 403: Forbidden - Not authorized to modify requested user's favorites
- 500: Internal Server Error - Failed to add tip to favorites

### 8. Remove Tip from Favorites

**Endpoint:** `DELETE /api/co2/favorite-tips/:userId/:tipId`

**Description:**  
Remove an eco tip from user's favorites.

**Parameters:**
- `userId`: ID of the user
- `tipId`: ID of the tip to remove

**Response:**
```json
{
  "success": true,
  "message": "Tip removed from favorites"
}
```

**Error Responses:**
- 401: Unauthorized - Missing or invalid token
- 403: Forbidden - Not authorized to modify requested user's favorites
- 500: Internal Server Error - Failed to remove tip from favorites

### 9. Export CO2 History

**Endpoint:** `GET /api/co2/export/:userId`

**Description:**  
Export a user's CO2 calculation history in JSON or CSV format.

**Parameters:**
- `userId`: ID of the user whose history is being exported
- `format` (query parameter): Format for export (`json` or `csv`), defaults to `json`

**Response:**
- When `format=json`:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "string",
        "userId": "string",
        "transportType": "string",
        "distance": "number",
        "co2Impact": "number",
        "date": "string"
      }
    ]
  }
  ```
- When `format=csv`: CSV file download with headers: ID,Date,Transport Type,Distance,CO2 Impact

**Error Responses:**
- 401: Unauthorized - Missing or invalid token
- 403: Forbidden - Not authorized to export requested user's data
- 500: Internal Server Error - Failed to export CO2 history

## Redis Caching Implementation

### Cached Data

1. **Emission Factors**
   - **Key:** `co2:emission_factors`
   - **TTL:** 3600 seconds (1 hour)
   - **Content:** JSON object with transport types and their emission factors

2. **User History**
   - **Key:** `user_history:{userId}`
   - **TTL:** 3600 seconds (1 hour)
   - **Content:** JSON array of user's CO2 calculations

3. **Eco Tips**
   - **Key:** `eco:tips:{userId}:{transportType}`
   - **TTL:** 86400 seconds (1 day)
   - **Content:** JSON array of personalized eco tips

4. **Favorite Tips**
   - **Key:** `eco:favorite_tips:{userId}`
   - **TTL:** No expiration (permanent until removed)
   - **Content:** JSON array of tip IDs saved as favorites

### Caching Logic

1. **For emission factors:**
   - Check if factors exist in cache
   - If yes, return cached data
   - If no, fetch from database, store in cache, then return

2. **For user history:**
   - Check if history exists in cache for the requested user
   - If yes, return cached data
   - If no, fetch from database, store in cache, then return

3. **For eco tips:**
   - Check if tips exist in cache for the user and transport type
   - If yes, return cached data
   - If no, generate personalized tips, store in cache, then return

### Implementation Example (JavaScript)

```javascript
// Example for retrieving emission factors with Redis caching
async function getEmissionFactors() {
  try {
    // Try to get from cache first
    const cachedFactors = await redis.get('co2:emission_factors');
    
    if (cachedFactors) {
      // Track cache hit
      await monitoring.trackCacheHit('co2:emission_factors');
      return JSON.parse(cachedFactors);
    }
    
    // Track cache miss
    await monitoring.trackCacheMiss('co2:emission_factors');
    
    // Fetch from database
    const factors = await database.getEmissionFactors();
    
    // Store in cache
    await redis.set('co2:emission_factors', JSON.stringify(factors));
    await redis.expire('co2:emission_factors', 3600);
    
    return factors;
  } catch (error) {
    logger.error(`Error getting emission factors: ${error.message}`);
    throw error;
  }
}
```

## Notes on Implementation

- Cache keys are designed to be descriptive and follow a consistent pattern
- TTL values are chosen based on data volatility and usage patterns
- Cache hits/misses are tracked for monitoring purposes
- Appropriate headers are included in responses to indicate cache status

## Limits and Restrictions

- **Maximum Favorites**: Users can save up to 50 favorite tips. When this limit is reached, the oldest tip is automatically removed.
- **History Size**: The user history cache stores a maximum of 100 most recent calculations per user.
- **Rate Limiting**: API endpoints are protected by rate limiting (10 requests per minute).
- **Transport Types**: Only `car`, `plane`, and `public` are accepted as valid transport types. Invalid types will default to `general` tips.

## Security Considerations

- **Input Validation**: All user inputs are validated before processing
- **Error Handling**: Detailed error handling prevents exposing sensitive information
- **Authentication**: Required for user-specific data
- **Role-based Access Control**: Prevents unauthorized access to other users' data
- **Redis Connection Failures**: Graceful handling of Redis connection failures to ensure the API continues to function
- **JSON Parsing**: Safe handling of JSON parsing errors to prevent application crashes
- **Cache Invalidation**: Proper cache invalidation when data changes
- **Error Logging**: Comprehensive error logging for security monitoring

## Monitoring and Maintenance

- Cache performance metrics are available in the admin dashboard
- Error logging and alerting for cache failures
- Regular cache eviction for stale data
- Response time tracking for both cached and non-cached requests

## Error Handling Strategy

The API implements a robust error handling strategy:

1. **Cache Misses**: Automatically fall back to database queries
2. **Redis Connection Failures**: Continue operation without caching
3. **JSON Parse Errors**: Generate fresh data instead of using corrupted cache
4. **Database Connection Errors**: Return clear error messages with appropriate HTTP status codes
5. **Invalid User Input**: Validate early and return descriptive error messages
6. **Authentication Failures**: Return 401 or 403 status codes as appropriate

## Example Usage

### JavaScript Example

```javascript
// Calculate CO2 emissions
async function calculateCO2(userId, transportType, distance) {
  const response = await fetch('/api/co2/calculate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_TOKEN'
    },
    body: JSON.stringify({
      userId,
      transportType,
      distance
    })
  });
  
  return response.json();
}

// Get emission factors (with cache)
async function getEmissionFactors() {
  const response = await fetch('/api/co2/factors');
  return response.json();
}

// Get user history
async function getUserHistory(userId) {
  const response = await fetch(`/api/co2/history/${userId}`, {
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN'
    }
  });
  
  return response.json();
}
```

## Implementation Notes

- The system uses Redis for caching emission factors and user history.
- Cache keys use a consistent naming convention for easy identification.
- TTL values are configurable and can be adjusted based on requirements.
- Cache invalidation is automatic when new data is added.
- The system gracefully handles Redis connectivity issues and falls back to direct data retrieval if needed.

## Performance Benefits

The Redis caching implementation provides several performance benefits:

1. **Reduced Response Time**: Cached responses are typically served in under 5ms.
2. **Lower Database Load**: Fewer queries to the database/data source.
3. **Improved Scalability**: The system can handle more concurrent requests.
4. **Resilience**: The system can continue to function even if the underlying data source is temporarily unavailable.

## Monitoring and Maintenance

The caching system includes logging for monitoring cache hits and misses. This information can be used to adjust cache TTL values for optimal performance.

## Security Considerations

- Rate limiting is applied to all API endpoints to prevent abuse.
- Authentication is required for personal data access.
- Role-based access control ensures users can only access their own data.
- Cache keys include user IDs to prevent data leakage between users. 