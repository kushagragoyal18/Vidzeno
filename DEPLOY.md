# Vidzeno Production Deployment Guide

This guide covers the complete deployment process for Vidzeno on a DigitalOcean droplet.

## Prerequisites

- DigitalOcean droplet (Ubuntu 24.04 LTS x64, minimum 2GB RAM, 2 vCPU recommended)
- Domain name pointing to your droplet IP
- DigitalOcean account (for Spaces storage)
- Stripe account (for payments)
- Google/GitHub developer accounts (for OAuth)

---

## Quick Start Deployment

### 1. SSH into your droplet

```bash
ssh root@143.198.169.215
```

### 2. Clone and run the deployment script

```bash
cd /opt
git clone https://github.com/kushagragoyal18/Vidzeno.git
cd Vidzeno
chmod +x deploy.sh
sudo ./deploy.sh
```

### 3. Follow the prompts

The script will:
- Install Docker, Docker Compose, and Nginx
- Clone the repository
- Create the `.env` file from template
- Configure Nginx
- Start all services
- Optionally run Certbot for SSL

---

## Post-Deployment Checklist

### 1. DigitalOcean Spaces Setup

1. **Create a new Space**
   - Go to: https://cloud.digitalocean.com/spaces
   - Click "Create a Spaces bucket"
   - Choose a region close to your users (e.g., `nyc3`, `sfo3`, `ams3`)
   - Name it something unique (e.g., `vidzeno-uploads-xyz123`)
   - Keep "Restrict file listing" enabled for security

2. **Generate API credentials**
   - Go to Settings tab of your Space
   - Click "Generate new key"
   - Copy the Access Key and Secret Key
   - Add to `.env`:
     ```
     DO_SPACES_ACCESS_KEY=your_access_key
     DO_SPACES_SECRET_KEY=your_secret_key
     DO_SPACES_REGION=nyc3
     DO_SPACES_BUCKET=vidzeno-uploads-xyz123
     DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
     ```

3. **Configure CORS for your Space**
   - In Spaces settings, add CORS configuration:
     ```json
     [
       {
         "AllowedOrigins": ["https://your-domain.com"],
         "AllowedMethods": ["GET", "PUT", "POST"],
         "AllowedHeaders": ["*"],
         "MaxAgeSeconds": 3600
       }
     ]
     ```

### 2. Stripe Setup

1. **Get API keys**
   - Go to: https://dashboard.stripe.com/apikeys
   - Copy the secret key (`sk_live_...`) and publishable key (`pk_live_...`)
   - Add to `.env`:
     ```
     STRIPE_SECRET_KEY=sk_live_...
     STRIPE_PUBLISHABLE_KEY=pk_live_...
     ```

2. **Create products and prices**
   - Go to: https://dashboard.stripe.com/products
   - Create a "Premium" product with two prices:
     - Monthly subscription (e.g., $9.99/month)
     - Yearly subscription (e.g., $99.99/year)
   - Copy the price IDs (`price_...`) to `.env`:
     ```
     STRIPE_PRICE_ID_MONTHLY=price_xxx
     STRIPE_PRICE_ID_YEARLY=price_yyy
     ```

3. **Configure webhooks**
   - Go to: https://dashboard.stripe.com/webhooks
   - Click "Add endpoint"
   - Endpoint URL: `https://your-domain.com/api/webhooks/stripe`
   - Select events:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment.succeeded`
     - `invoice.payment_failed`
   - Copy the webhook signing secret (`whsec_...`) to `.env`:
     ```
     STRIPE_WEBHOOK_SECRET=whsec_...
     ```

4. **Test Stripe integration**
   ```bash
   # View backend logs while testing
   docker compose -f docker-compose.prod.yml logs -f backend
   ```

### 3. OAuth Configuration

#### Google OAuth

1. **Create OAuth credentials**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: "Web application"
   - Authorized JavaScript origins: `https://your-domain.com`
   - Authorized redirect URIs: `https://your-domain.com/api/auth/google/callback`
   - Copy Client ID and Client Secret to `.env`:
     ```
     GOOGLE_CLIENT_ID=your_client_id
     GOOGLE_CLIENT_SECRET=your_client_secret
     GOOGLE_CALLBACK_URL=https://your-domain.com/api/auth/google/callback
     ```

#### GitHub OAuth

1. **Create OAuth credentials**
   - Go to: https://github.com/settings/developers
   - Click "New OAuth App"
   - Application name: "Vidzeno"
   - Homepage URL: `https://your-domain.com`
   - Authorization callback URL: `https://your-domain.com/api/auth/github/callback`
   - Copy Client ID and Client Secret to `.env`:
     ```
     GITHUB_CLIENT_ID=your_client_id
     GITHUB_CLIENT_SECRET=your_client_secret
     GITHUB_CALLBACK_URL=https://your-domain.com/api/auth/github/callback
     ```

### 4. Apply Environment Changes

After editing `.env`, restart services:

```bash
cd /opt/vidzeno
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### 5. SSL Certificate (if not done during deployment)

```bash
certbot --nginx -d your-domain.com -d www.your-domain.com
```

Certbot will automatically renew the certificate. Verify renewal is configured:

```bash
certbot renew --dry-run
```

---

## Redeploying After Code Changes

### Option 1: Quick Redeploy (Recommended)

```bash
cd /opt/vidzeno
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Option 2: Full Rebuild

```bash
cd /opt/vidzeno
git pull
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build --force-recreate
```

### Option 3: Using the deploy script

```bash
cd /opt/vidzeno
git pull
sudo ./deploy.sh
```

---

## Monitoring & Maintenance

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f worker
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f postgres
```

### Check Service Health

```bash
docker compose -f docker-compose.prod.yml ps
```

### Access Database

```bash
# Connect to PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres psql -U vidzeno -d vidzeno

# Backup database
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U vidzeno vidzeno > backup.sql

# Restore from backup
docker compose -f docker-compose.prod.yml exec -T postgres psql -U vidzeno -d vidzeno < backup.sql
```

### Redis Commands

```bash
# Connect to Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli

# Monitor queue
docker compose -f docker-compose.prod.yml exec redis redis-cli KEYS '*'
```

### Cleanup Old Data

```bash
# Remove unused Docker resources
docker system prune -a

# Clean up old images
docker image prune -a
```

---

## Troubleshooting

### Backend won't start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs backend

# Common issues:
# 1. Database not ready - wait for postgres healthcheck
# 2. Wrong DATABASE_URL - check .env
# 3. Port already in use - check with: netstat -tlnp | grep 3001
```

### Worker not processing jobs

```bash
# Check worker logs
docker compose -f docker-compose.prod.yml logs worker

# Verify Redis connection
docker compose -f docker-compose.prod.yml exec worker redis-cli -h redis ping

# Check queue status
docker compose -f docker-compose.prod.yml exec redis redis-cli KEYS 'video-conversions-*'
```

### File upload fails

```bash
# Check available disk space
df -h

# Check upload directory permissions
docker compose -f docker-compose.prod.yml exec backend ls -la /app/uploads

# Verify DigitalOcean Spaces credentials
# Test S3 connection with AWS CLI or similar tool
```

### Nginx returns 502 Bad Gateway

```bash
# Check if backend is running
curl http://localhost:3001/health

# Check Nginx configuration
nginx -t

# Restart Nginx
systemctl restart nginx

# Check Nginx logs
tail -f /var/log/nginx/vidzeno_error.log
```

---

## Security Recommendations

1. **Firewall rules**
   ```bash
   ufw allow ssh
   ufw allow http
   ufw allow https
   ufw enable
   ```

2. **Regular updates**
   ```bash
   # Weekly system updates
   apt update && apt upgrade -y
   ```

3. **Database backups**
   ```bash
   # Add to crontab for daily backups
   0 2 * * * cd /opt/vidzeno && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U vidzeno vidzeno > /backups/vidzeno_$(date +\%Y\%m\%d).sql
   ```

4. **Monitor disk usage**
   ```bash
   # Add monitoring for /opt/vidzeno volume
   df -h /opt/vidzeno
   ```

5. **Rotate secrets periodically**
   - JWT_SECRET
   - SESSION_SECRET
   - Database password
   - API keys

---

## Architecture Overview

```
                    ┌─────────────────┐
                    │     Nginx       │
                    │    (Port 80/    │
                    │     443)        │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              │
    ┌─────────────────┐ ┌─────────────────┐ │
    │   Frontend      │ │    Backend      │ │
    │   (Port 5173)   │ │   (Port 3001)   │ │
    │   React + Vite  │ │  Express + TS   │ │
    └─────────────────┘ └────────┬────────┘ │
                                 │          │
                    ┌────────────┼──────────┘
                    │            │
              ┌─────▼─────┐ ┌───▼────┐
              │ Postgres  │ │ Redis  │
              │ (Port 5432)│ │(Port 6379)
              └───────────┘ └────────┘
                                 │
                          ┌──────▼──────┐
                          │   Worker    │
                          │  (FFmpeg)   │
                          └─────────────┘
                                 │
                          ┌──────▼──────┐
                          │ DO Spaces   │
                          │   (S3)      │
                          └─────────────┘
```

---

## Support

For issues or questions:
- Check existing issues: https://github.com/kushagragoyal18/Vidzeno/issues
- Create a new issue with deployment details
- Review logs before reporting: `docker compose -f docker-compose.prod.yml logs`
