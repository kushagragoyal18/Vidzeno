#!/bin/bash
# ============================================
# Vidzeno Manual Deployment Script
# Run this on your DigitalOcean droplet
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Vidzeno Production Deployment${NC}"
echo -e "${BLUE}  Domain: vidzeno.tech${NC}"
echo -e "${BLUE}  IP: 143.198.169.215${NC}"
echo -e "${BLUE}============================================${NC}"

# Step 1: Update system
echo -e "${YELLOW}[1/7] Updating system...${NC}"
apt update && apt upgrade -y

# Step 2: Install dependencies
echo -e "${YELLOW}[2/7] Installing dependencies...${NC}"
apt install -y curl git nginx certbot python3-certbot-nginx ca-certificates gnupg lsb-release ufw

# Step 3: Install Docker
echo -e "${YELLOW}[3/7] Installing Docker...${NC}"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker && systemctl start docker

# Step 4: Install Docker Compose
echo -e "${YELLOW}[4/7] Installing Docker Compose...${NC}"
DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Step 5: Clone repository
echo -e "${YELLOW}[5/7] Cloning repository...${NC}"
cd /opt
rm -rf vidzeno 2>/dev/null || true
git clone https://github.com/kushagragoyal18/Vidzeno.git vidzeno
cd /opt/vidzeno

# Step 6: Create .env file with all credentials
echo -e "${YELLOW}[6/7] Creating .env file...${NC}"
cat > .env << 'ENVEOF'
NODE_ENV=production
FRONTEND_URL=https://vidzeno.tech

POSTGRES_USER=vidzeno
POSTGRES_DB=vidzeno
POSTGRES_PASSWORD=REPLACE_WITH_SECURE_PASSWORD

REDIS_PASSWORD=REPLACE_WITH_SECURE_PASSWORD

JWT_SECRET=REPLACE_WITH_RANDOM_64_CHAR_HEX
SESSION_SECRET=REPLACE_WITH_RANDOM_64_CHAR_HEX

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://vidzeno.tech/api/auth/google/callback

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=https://vidzeno.tech/api/auth/github/callback

STRIPE_SECRET_KEY=REPLACE_WITH_YOUR_STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=REPLACE_WITH_YOUR_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET=REPLACE_WITH_YOUR_STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID_MONTHLY=REPLACE_WITH_YOUR_STRIPE_PRICE_ID
STRIPE_PRICE_ID_YEARLY=REPLACE_WITH_YOUR_STRIPE_PRICE_ID

DO_SPACES_ACCESS_KEY=REPLACE_WITH_YOUR_DO_SPACES_KEY
DO_SPACES_SECRET_KEY=REPLACE_WITH_YOUR_DO_SPACES_SECRET
DO_SPACES_REGION=nyc3
DO_SPACES_BUCKET=vidzeno-uploads
DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com

VITE_API_URL=

MAX_FILE_SIZE_FREE=524288000
MAX_FILE_SIZE_PREMIUM=4294967296
MAX_CONVERSIONS_FREE_DAILY=2

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=10

FFMPEG_TIMEOUT=600000
FFMPEG_WATERMARK_TEXT=Converted with Vidzeno (Free)
ENVEOF

echo -e "${GREEN}✓ .env file created${NC}"

# Step 7: Configure Nginx
echo -e "${YELLOW}[7/7] Configuring Nginx...${NC}"

# Create nginx config
cat > /etc/nginx/sites-available/vidzeno << 'NGINXEOF'
upstream backend {
    server 127.0.0.1:3001;
    keepalive 32;
}

upstream frontend {
    server 127.0.0.1:5173;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name vidzeno.tech www.vidzeno.tech;

    client_max_body_size 4096M;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    access_log /var/log/nginx/vidzeno_access.log;
    error_log /var/log/nginx/vidzeno_error.log;

    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        client_max_body_size 4096M;
    }

    location /api/webhooks/stripe {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        client_max_body_size 4096M;
    }

    location /health {
        proxy_pass http://backend;
        proxy_connect_timeout 10s;
        proxy_read_timeout 10s;
    }

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location ~ /\. {
        deny all;
    }
}
NGINXEOF

# Enable site
ln -sf /etc/nginx/sites-available/vidzeno /etc/nginx/sites-enabled/vidzeno
rm -f /etc/nginx/sites-enabled/default
nginx -t

# Configure firewall
echo -e "${YELLOW}Configuring firewall...${NC}"
ufw allow ssh
ufw allow http
ufw allow https
echo "yes" | ufw enable

# Start Docker services
echo -e "${YELLOW}Starting Docker services...${NC}"
cd /opt/vidzeno
docker compose -f docker-compose.prod.yml up -d --build

echo "Waiting for services to start..."
sleep 15

docker compose -f docker-compose.prod.yml ps

# Check backend health
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is healthy${NC}"
else
    echo -e "${YELLOW}Backend starting up...${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Your application is running at:"
echo -e "  ${BLUE}http://143.198.169.215${NC}"
echo -e "  ${BLUE}https://vidzeno.tech${NC} (after SSL)"
echo ""
echo "To enable SSL, run:"
echo -e "  ${BLUE}certbot --nginx -d vidzeno.tech -d www.vidzeno.tech${NC}"
echo ""
echo "Useful commands:"
echo -e "  Logs: ${BLUE}docker compose -f docker-compose.prod.yml logs -f${NC}"
echo -e "  Status: ${BLUE}docker compose -f docker-compose.prod.yml ps${NC}"
echo -e "  Restart: ${BLUE}docker compose -f docker-compose.prod.yml restart${NC}"
