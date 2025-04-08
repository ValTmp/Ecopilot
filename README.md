# EcoPilot - CO2 Calculator with Redis Caching

EcoPilot is an eco-friendly application that helps users track and reduce their carbon footprint. This README focuses on the Redis caching implementation for the CO2 calculator and the monitoring dashboard.

## Redis Caching Implementation

The CO2 calculator uses Redis as a caching layer to optimize performance and reduce database load. The following data is cached:

1. **Emission Factors**: Static data that rarely changes, cached for 1 hour
2. **User History**: Calculation history for each user, cached for 1 hour
3. **Eco Tips**: Personalized CO2 reduction tips, cached for 1 day
4. **Favorite Tips**: User's favorite eco tips, stored permanently

### Key Performance Benefits

- Reduced response times (typically 5-10ms vs. 120-150ms without caching)
- Lower database load
- Improved scalability
- Resilience against data source unavailability

## Monitoring Dashboard

We've implemented a comprehensive monitoring system for the Redis cache with these features:

- Real-time cache hit/miss metrics
- Response time comparison between cached vs. non-cached requests
- Service-specific performance breakdowns
- Error tracking and reporting
- Real-time cache health checking
- Detailed performance breakdowns for database fetches and cache operations
- Timeout protection for Redis operations

### Accessing the Admin Dashboard

1. Navigate to `/admin-login.html`
2. Log in with admin credentials
3. View and analyze cache performance metrics

### Monitoring Architecture

The monitoring system consists of:

1. **Data Collection Layer**: Tracks cache hits, misses, and response times in real time
2. **Storage Layer**: Stores metrics in Redis with TTL of 7 days
3. **API Layer**: Exposes metrics through secure RESTful endpoints
4. **Visualization Layer**: Displays metrics with charts and tables in the admin dashboard
5. **Health Check System**: Performs real-time diagnostics on cache responsiveness

## Implementation Details

### Cache Keys

- `co2:emission_factors` - For emission factors data
- `user_history:{userId}` - For user history data
- `eco:tips:{userId}:{transportType}` - For personalized eco tips
- `eco:favorite_tips:{userId}` - For user's favorite tips

### Cache Strategy

- **Metadata Enhancement**: Cached responses include `_fromCache` metadata for tracking
- **Timeout Protection**: Redis operations have 500ms timeouts to prevent blocking
- **Automatic Fallback**: System gracefully degrades to database access when cache fails
- **Cache Repair**: Automatic cache repair with default values if corrupted
- **Consistent Headers**: All API responses include `X-Cache` headers indicating data source

### Technologies Used

- Redis for caching and metrics storage
- Express.js for API endpoints
- Chart.js for data visualization
- TailwindCSS for dashboard UI

## API Endpoints

The monitoring system exposes these API endpoints:

- `GET /api/monitoring/cache` - Get cache performance metrics
- `GET /api/monitoring/endpoints` - Get API endpoint usage metrics
- `GET /api/monitoring/errors` - Get detailed error logs
- `GET /api/monitoring/cache-health` - Perform a real-time health check on the Redis cache

## Key Files

- `src/services/co2Calculator.js` - Core calculator with caching implementation
- `src/services/monitoring.js` - Monitoring service implementation
- `src/routes/monitoringRoutes.js` - API endpoints for monitoring
- `public/admin-dashboard.html` - Admin dashboard UI
- `public/co2-calculator.html` - User-facing calculator with cache status indicators

## Best Practices Implemented

1. **Cache Invalidation Strategy**: Automatic TTL with selective invalidation on updates
2. **Error Resilience**: Fallback to direct data access when cache fails
3. **Performance Tracking**: Granular timing of cache and database operations
4. **Security**: Admin-only access to monitoring dashboard
5. **Cache Headers**: Browser-side caching with appropriate cache control headers
6. **Timeout Protection**: Redis operations have timeouts to prevent blocking
7. **Data Validation**: Cached data is validated before use to prevent corruption
8. **Granular Metrics**: Separate tracking for cache hits, misses, and response times

## Setup and Configuration

1. Ensure Redis is installed and running
2. Set environment variables:
   - `REDIS_URL` - Redis connection string
   - `REDIS_TTL` - Default TTL for cached items (in seconds)
3. Start the application with `npm start`

## Features

- **CO2 Calculator**: Calculate the carbon footprint of different transport methods
- **User History**: Track your CO2 emissions over time
- **Personalized Eco Tips**: Get tailored tips to reduce your carbon footprint based on your travel habits
- **Favorite Tips**: Save useful eco tips to your favorites for easy reference
- **Data Export**: Export your CO2 calculation history as CSV or JSON
- **Rate Limiting**: Prevent abuse with Redis-backed rate limiting
- **Secure Authentication**: JWT-based authentication with refresh tokens
- **Data Storage**: Airtable integration for flexible data management
- **Performance Optimization**: Redis caching for improved response times
- **API Documentation**: Comprehensive documentation for all endpoints

## Technology Stack

- **Backend**: Node.js with Express
- **Authentication**: JWT tokens with refresh tokens
- **Rate Limiting**: Redis-backed rate limiting
- **Database**: Airtable
- **Caching**: Redis
- **Validation**: Joi
- **Logging**: Winston
- **Testing**: Jest

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Redis
- Airtable account

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/YourUsername/ecopilot.git
   cd ecopilot
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Copy the example environment file and update it with your values:
   ```
   cp .env.example .env
   ```

4. Start the development server:
   ```
   npm run dev
   ```

## API Endpoints

### CO2 Calculator

#### Calculate CO2 Emissions

- **URL**: `/api/co2/calculate`
- **Method**: `POST`
- **Auth required**: Yes
- **Request body**:
  ```json
  {
    "transportType": "car",
    "distance": 10.5
  }
  ```
- **Response**:
  ```json
  {
    "emissions": 2.625,
    "unit": "kg",
    "transportType": "car",
    "distance": 10.5
  }
  ```

#### Get Emission Factors

- **URL**: `/api/co2/factors`
- **Method**: `GET`
- **Auth required**: No
- **Response**:
  ```json
  {
    "car": 0.25,
    "plane": 0.40,
    "public": 0.10
  }
  ```

#### Get User History

- **URL**: `/api/co2/history`
- **Method**: `GET`
- **Auth required**: Yes
- **Response**:
  ```json
  [
    {
      "id": "rec123abc",
      "transportType": "car",
      "distance": 10.5,
      "emissions": 2.625,
      "timestamp": "2025-04-01T12:00:00Z"
    }
  ]
  ```

#### Get Eco Tips

- **URL**: `/api/co2/tips`
- **Method**: `GET`
- **Auth required**: Yes
- **Query parameters**:
  - `userId`: User ID
  - `transportType`: Type of transport (car, plane, public)
  - `distance`: Distance traveled in kilometers
- **Response**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "car-1",
        "tip": "Try carpooling with colleagues or neighbors to reduce per-person emissions.",
        "impact": "high",
        "category": "behavioral"
      },
      {
        "id": "car-5",
        "tip": "Try to combine multiple errands into a single trip to reduce total distance traveled.",
        "impact": "medium",
        "category": "planning"
      },
      {
        "id": "general-2",
        "tip": "Plan your trips efficiently to minimize unnecessary travel.",
        "impact": "medium",
        "category": "planning"
      }
    ]
  }
  ```

#### Get Tip Categories

- **URL**: `/api/co2/tip-categories`
- **Method**: `GET`
- **Auth required**: No
- **Response**:
  ```json
  {
    "success": true,
    "data": ["behavioral", "maintenance", "planning", "investment", "alternative", "lifestyle", "advocacy", "affirmation"]
  }
  ```

#### Get Favorite Tips

- **URL**: `/api/co2/favorite-tips/:userId`
- **Method**: `GET`
- **Auth required**: Yes
- **Response**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "car-1",
        "tip": "Try carpooling with colleagues or neighbors to reduce per-person emissions.",
        "impact": "high",
        "category": "behavioral"
      }
    ]
  }
  ```

#### Add Tip to Favorites

- **URL**: `/api/co2/favorite-tips/:userId`
- **Method**: `POST`
- **Auth required**: Yes
- **Request body**:
  ```json
  {
    "tipId": "car-1"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Tip added to favorites"
  }
  ```

#### Remove Tip from Favorites

- **URL**: `/api/co2/favorite-tips/:userId/:tipId`
- **Method**: `DELETE`
- **Auth required**: Yes
- **Response**:
  ```json
  {
    "success": true,
    "message": "Tip removed from favorites"
  }
  ```

#### Export CO2 History

- **URL**: `/api/co2/export/:userId`
- **Method**: `GET`
- **Auth required**: Yes
- **Query parameters**:
  - `format`: Format for export (`json` or `csv`), defaults to `json`
- **Response**:
  - When `format=json`: JSON response with history data
  - When `format=csv`: CSV file download

## Environment Variables

See `.env.example` for all required environment variables.

## Testing

Run the test suite with:
```
npm test
```

Run specific tests with:
```
npm test -- -t "co2Routes"
```

## Deployment

### Using Docker

1. Build the Docker image:
   ```
   docker build -t ecopilot .
   ```

2. Run the container:
   ```
   docker run -p 3000:3000 --env-file .env ecopilot
   ```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Express](https://expressjs.com/)
- [Airtable](https://airtable.com/)
- [Redis](https://redis.io/)
- [Jest](https://jestjs.io/)
- [Joi](https://joi.dev/) 