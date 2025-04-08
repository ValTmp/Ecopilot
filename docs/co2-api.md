# CO2 Calculator API Documentation

## Overview
The CO2 Calculator API provides endpoints for calculating carbon dioxide emissions from different modes of transportation, retrieving emission factors, and accessing user calculation history. All data is stored in Airtable and cached using Redis for optimal performance.

## Base URL
```
https://api.ecopilot.com/api/co2
```

## Authentication
All endpoints require authentication using a Bearer token:
```
Authorization: Bearer <your_token>
```

## Endpoints

### Calculate CO2 Emissions
Calculate CO2 emissions for a specific transportation type and distance, and save the calculation to the database.

**Endpoint:** `POST /calculate`

**Request Body:**
```json
{
  "transportType": "car",
  "distance": 100,
  "userId": "user123"
}
```

**Parameters:**
- `transportType` (string, required): Type of transportation ('car', 'plane', or 'public')
- `distance` (number, required): Distance traveled in kilometers
- `userId` (string, required): User identifier for whom the calculation is being made

**Response:**
```json
{
  "success": true,
  "emissions": 17.1,
  "unit": "kg",
  "transportType": "car",
  "distance": 100,
  "userId": "user123"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

**Status Codes:**
- 200: Success
- 400: Invalid input (e.g., invalid transport type, negative distance)
- 401: Unauthorized (missing or invalid token)
- 429: Rate limit exceeded (max 10 requests per minute)
- 500: Server error

### Get User History
Retrieve CO2 calculation history for a specific user, with Redis caching (TTL: 300 seconds).

**Endpoint:** `GET /history/:userId`

**Parameters:**
- `userId` (path parameter, required): User identifier

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "rec123",
      "type": "transport_car",
      "description": "Car travel: 100 km",
      "co2Impact": 17.1,
      "date": "2024-03-20T10:30:00Z",
      "createdAt": "2024-03-20T10:30:00Z"
    }
  ]
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "You are not authorized to view this user's history"
}
```

**Status Codes:**
- 200: Success
- 401: Unauthorized (missing or invalid token)
- 403: Forbidden (attempting to access another user's history without admin privileges)
- 500: Server error

**Access Control:**
- Users can only access their own history
- Admins can access any user's history

### Get Emission Factors
Retrieve current emission factors for different transportation types, with Redis caching (TTL: 3600 seconds).

**Endpoint:** `GET /factors`

**Response:**
```json
{
  "car": 0.171,
  "plane": 0.255,
  "public": 0.04
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Failed to retrieve emission factors"
}
```

**Status Codes:**
- 200: Success
- 429: Rate limit exceeded
- 500: Server error

**Headers:**
- `X-Cache`: Indicates if the response was served from cache (`HIT`) or from the source (`MISS`)

## Rate Limiting
- 10 requests per minute per user (or IP address for unauthenticated requests)
- Rate limiting is implemented using Redis for distributed applications
- When rate limit is exceeded, a 429 status code is returned with a message indicating when the limit will reset

## Caching Strategy
- **Emission Factors**: Cached for 1 hour (3600 seconds)
- **User History**: Cached for 5 minutes (300 seconds)
- Cache is automatically invalidated when new calculations are saved

## Data Storage
All CO2 calculations are stored in Airtable with the following information:
- User ID
- Transport type
- Distance
- CO2 emissions
- Timestamp

## Implementation Notes
- Input validation uses Joi schemas to ensure data integrity
- Comprehensive error handling with appropriate HTTP status codes
- All CO2-related activities are logged with a dedicated CO2 log level

## Examples

### Calculate CO2 Emissions
```bash
curl -X POST https://api.ecopilot.com/api/co2/calculate \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"transportType": "car", "distance": 100, "userId": "user123"}'
```

### Get User History
```bash
curl https://api.ecopilot.com/api/co2/history/user123 \
  -H "Authorization: Bearer <your_token>"
```

### Get Emission Factors
```bash
curl https://api.ecopilot.com/api/co2/factors
```

## Changelog
- **2024-04-08**: Updated API with improved caching, validation, and error handling
- **2024-03-15**: Initial API release 