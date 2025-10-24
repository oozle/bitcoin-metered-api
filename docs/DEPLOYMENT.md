# Deployment Guide

Production deployment instructions for Bitcoin Metered API.

## Prerequisites

- Node.js 18+ 
- 1GB RAM minimum
- 10GB disk space
- SSL certificate (for HTTPS)
- Arkade wallet with funded VTXOs (for testnet/mainnet mode)

## Environment Setup

### 1. Production Environment Variables

Create `.env.production`:

```bash
# Server
PORT=3000
NODE_ENV=production

# Payment Mode
PAYMENTS_MODE=testnet  # or mainnet

# Arkade Configuration
ARK_ASP_URL=https://asp.testnet.arkade.example
ARK_RECEIVER_PUBKEY=your_actual_ark_pubkey

# Database
DATABASE_PATH=/var/lib/bitcoin-metered-api/db.sqlite

# Logging
LOG_LEVEL=info
```

### 2. Build Application

```bash
npm run build
```

## Deployment Options

### Option 1: PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'bitcoin-metered-api',
    script: './dist/server.js',
    instances: 2,
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 config
pm2 save

# Setup startup script
pm2 startup
```

### Option 2: systemd

```bash
# Create systemd service
sudo cat > /etc/systemd/system/bitcoin-metered-api.service << 'EOF'
[Unit]
Description=Bitcoin Metered API
After=network.target

[Service]
Type=simple
User=bitcoin-api
WorkingDirectory=/opt/bitcoin-metered-api
EnvironmentFile=/opt/bitcoin-metered-api/.env.production
ExecStart=/usr/bin/node /opt/bitcoin-metered-api/dist/server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl enable bitcoin-metered-api
sudo systemctl start bitcoin-metered-api

# Check status
sudo systemctl status bitcoin-metered-api
```

### Option 3: Docker

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

```bash
# Build image
docker build -t bitcoin-metered-api .

# Run container
docker run -d \
  --name bitcoin-metered-api \
  -p 3000:3000 \
  -e PAYMENTS_MODE=testnet \
  -e ARK_ASP_URL=https://asp.testnet.arkade.example \
  -e ARK_RECEIVER_PUBKEY=ark1q... \
  -v /var/lib/bitcoin-metered-api:/data \
  bitcoin-metered-api
```

### Option 4: Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PAYMENTS_MODE=testnet
      - ARK_ASP_URL=https://asp.testnet.arkade.example
      - ARK_RECEIVER_PUBKEY=ark1q...
      - DATABASE_PATH=/data/db.sqlite
    volumes:
      - api-data:/data
    restart: unless-stopped

volumes:
  api-data:
```

```bash
docker-compose up -d
```

## Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/bitcoin-metered-api
server {
    listen 80;
    server_name api.yourdomain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Rate limiting (optional)
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
    limit_req zone=api_limit burst=20 nodelay;
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/bitcoin-metered-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL Certificate (Let's Encrypt)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal (already configured by certbot)
sudo certbot renew --dry-run
```

## Monitoring

### Logging

```bash
# PM2 logs
pm2 logs bitcoin-metered-api

# systemd logs
sudo journalctl -u bitcoin-metered-api -f

# Docker logs
docker logs -f bitcoin-metered-api
```

### Health Monitoring

```bash
# Add to cron for periodic health checks
*/5 * * * * curl -f http://localhost:3000/health || echo "API down" | mail -s "Alert" admin@yourdomain.com
```

### Prometheus Metrics (Optional)

Add to `src/server.ts`:

```typescript
import promClient from 'prom-client';

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

app.get('/metrics', async (req, reply) => {
  reply.header('Content-Type', register.contentType);
  return register.metrics();
});
```

## Backup Strategy

### Automated Backups

```bash
# Create backup script
cat > /usr/local/bin/backup-metered-api.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/bitcoin-metered-api"
DB_PATH="/var/lib/bitcoin-metered-api/db.sqlite"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
sqlite3 $DB_PATH ".backup '$BACKUP_DIR/db_$DATE.sqlite'"

# Keep only last 30 days
find $BACKUP_DIR -name "db_*.sqlite" -mtime +30 -delete
EOF

chmod +x /usr/local/bin/backup-metered-api.sh

# Add to cron (daily at 2 AM)
echo "0 2 * * * /usr/local/bin/backup-metered-api.sh" | crontab -
```

## Security Hardening

### Firewall

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp  # SSH
sudo ufw allow 80/tcp  # HTTP
sudo ufw allow 443/tcp # HTTPS
sudo ufw enable
```

### Application Security

1. **Run as non-root user**
```bash
sudo useradd -r -s /bin/false bitcoin-api
sudo chown -R bitcoin-api:bitcoin-api /opt/bitcoin-metered-api
```

2. **Restrict file permissions**
```bash
chmod 600 .env.production
chmod 700 /var/lib/bitcoin-metered-api
```

3. **Enable fail2ban** (optional)
```bash
sudo apt-get install fail2ban
```

## Performance Tuning

### Node.js

```bash
# Increase max memory (if needed)
NODE_OPTIONS="--max-old-space-size=2048" node dist/server.js
```

### Database

```bash
# Optimize SQLite
sqlite3 /var/lib/bitcoin-metered-api/db.sqlite "PRAGMA optimize; VACUUM;"

# Add to cron (weekly)
echo "0 3 * * 0 sqlite3 /var/lib/bitcoin-metered-api/db.sqlite 'PRAGMA optimize; VACUUM;'" | crontab -
```

## Scaling

### Horizontal Scaling

Use PM2 cluster mode:
```javascript
// ecosystem.config.js
instances: 'max', // or specific number
exec_mode: 'cluster'
```

### Load Balancing

```nginx
upstream bitcoin_api {
    least_conn;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    location / {
        proxy_pass http://bitcoin_api;
    }
}
```

## Upgrading

```bash
# Pull latest code
git pull origin main

# Install dependencies
npm ci

# Build
npm run build

# Restart service
pm2 reload ecosystem.config.js
# or
sudo systemctl restart bitcoin-metered-api
# or
docker-compose up -d --build
```

## Rollback

```bash
# With PM2
pm2 reload ecosystem.config.js --update-env

# With systemd
sudo systemctl restart bitcoin-metered-api

# With Docker
docker-compose down
docker-compose up -d <previous_image_tag>
```

## Troubleshooting

See [RUNBOOK.md](./RUNBOOK.md) for detailed troubleshooting.

## Support

- **Issues**: GitHub Issues
- **Email**: support@yourdomain.com
- **Docs**: https://docs.yourdomain.com
