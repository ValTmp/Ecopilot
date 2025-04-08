# EcoPilot Deployment Guide

This guide explains how to deploy the EcoPilot application to different environments.

## Prerequisites

- Node.js (v18 or higher)
- Redis server
- Airtable account with API key
- Domain name (for production)
- SSL certificate (for production)

## Deployment Options

### 1. Docker Deployment

The simplest way to deploy EcoPilot is using Docker and Docker Compose.

#### Development Environment

1. Clone the repository:
   ```
   git clone https://github.com/YourUsername/ecopilot.git
   cd ecopilot
   ```

2. Create your `.env` file based on the example:
   ```
   cp .env.example .env
   ```

3. Edit the `.env` file with your credentials and configuration

4. Start the application with Docker Compose:
   ```
   docker-compose up -d
   ```

#### Production Environment

1. Clone the repository:
   ```
   git clone https://github.com/YourUsername/ecopilot.git
   cd ecopilot
   ```

2. Create a production `.env` file:
   ```
   cp .env.example .env.production
   ```

3. Edit the `.env.production` file with your production credentials

4. Create a production Docker Compose file:
   ```
   cp docker-compose.yml docker-compose.prod.yml
   ```

5. Edit the `docker-compose.prod.yml` file to:
   - Remove volume mounts for the application code
   - Set `NODE_ENV=production`
   - Add SSL configuration
   - Configure proper restart policies

6. Build and start the production containers:
   ```
   docker-compose -f docker-compose.prod.yml up -d --build
   ```

### 2. Traditional Deployment

#### Setting up the Server

1. Update and install dependencies:
   ```
   sudo apt update
   sudo apt upgrade -y
   sudo apt install -y nodejs npm redis-server nginx certbot
   ```

2. Install Node.js v18:
   ```
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. Install PM2 for process management:
   ```
   sudo npm install -g pm2
   ```

#### Deploying the Application

1. Clone the repository:
   ```
   git clone https://github.com/YourUsername/ecopilot.git
   cd ecopilot
   ```

2. Install dependencies:
   ```
   npm ci --production
   ```

3. Create your `.env` file:
   ```
   cp .env.example .env
   ```

4. Edit the `.env` file with your production credentials

5. Start the application with PM2:
   ```
   pm2 start src/app.js --name ecopilot
   pm2 save
   pm2 startup
   ```

#### Setting up Nginx as a Reverse Proxy

1. Create an Nginx configuration:
   ```
   sudo nano /etc/nginx/sites-available/ecopilot
   ```

2. Add the following configuration:
   ```
   server {
       listen 80;
       server_name yourdomain.com www.yourdomain.com;
   
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. Enable the site:
   ```
   sudo ln -s /etc/nginx/sites-available/ecopilot /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

4. Set up SSL with Certbot:
   ```
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

#### Monitoring and Maintenance

1. Monitor application logs:
   ```
   pm2 logs ecopilot
   ```

2. Monitor server resources:
   ```
   pm2 monit
   ```

3. Set up automatic updates:
   ```
   sudo apt install unattended-upgrades
   sudo dpkg-reconfigure unattended-upgrades
   ```

### 3. Serverless Deployment

For serverless deployment, you'll need to modify the application to work with serverless functions.

#### AWS Lambda

1. Install the Serverless Framework:
   ```
   npm install -g serverless
   ```

2. Initialize a new Serverless project:
   ```
   serverless create --template aws-nodejs --path ecopilot-serverless
   ```

3. Modify the application to work with AWS Lambda by splitting the API routes into separate handler functions.

4. Deploy to AWS:
   ```
   serverless deploy
   ```

## CI/CD Integration

For continuous deployment, you can use GitHub Actions.

1. Create a `.github/workflows/deploy.yml` file:
   ```yaml
   name: Deploy

   on:
     push:
       branches: [ main ]

   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
       - uses: actions/checkout@v2
       
       - name: Set up Node.js
         uses: actions/setup-node@v2
         with:
           node-version: '18'
           
       - name: Install dependencies
         run: npm ci
         
       - name: Run tests
         run: npm test
         
       - name: Deploy to production
         uses: appleboy/ssh-action@master
         with:
           host: ${{ secrets.HOST }}
           username: ${{ secrets.USERNAME }}
           key: ${{ secrets.SSH_KEY }}
           script: |
             cd /path/to/ecopilot
             git pull
             npm ci --production
             pm2 restart ecopilot
   ```

2. Set up the repository secrets in GitHub:
   - `HOST`: Your server hostname
   - `USERNAME`: SSH username
   - `SSH_KEY`: Private SSH key

## Environment Configuration

Ensure the following environment variables are properly set:

### Required Variables

- `NODE_ENV`: Environment (development, test, production)
- `PORT`: Application port
- `AIRTABLE_API_KEY`: Airtable API key
- `AIRTABLE_BASE_ID`: Airtable base ID
- `JWT_SECRET`: Secret for JWT tokens
- `JWT_REFRESH_SECRET`: Secret for JWT refresh tokens
- `REDIS_URL`: Redis connection URL

### Optional Variables

- `LOG_LEVEL`: Logging level (debug, info, warn, error)
- `ALLOWED_ORIGINS`: CORS allowed origins
- `CACHE_TTL`: Default cache TTL in seconds

## Backup Strategy

### Database Backups

Since we're using Airtable, backups are handled by the service. However, consider implementing a periodic export:

1. Create a cron job that calls an export API endpoint
2. Store exports in a secure location (S3, Google Drive, etc.)

### Redis Data

Set up Redis persistence:

1. Edit the Redis configuration to enable AOF persistence:
   ```
   appendonly yes
   appendfsync everysec
   ```

2. Set up periodic RDB snapshots:
   ```
   save 900 1
   save 300 10
   save 60 10000
   ```

## Security Considerations

1. Keep all dependencies updated:
   ```
   npm audit
   npm update
   ```

2. Use a Web Application Firewall (WAF)

3. Set up rate limiting

4. Implement proper logging for security events

5. Regularly review and rotate access keys

6. Enable HTTPS-only access

## Troubleshooting

### Common Issues

1. **Redis connection failed**
   - Check if Redis is running
   - Verify the connection URL
   - Check firewall settings

2. **API rate limit exceeded**
   - Adjust the rate limiter settings
   - Implement better caching

3. **JWT token issues**
   - Verify JWT secrets are properly set
   - Check token expiration times 