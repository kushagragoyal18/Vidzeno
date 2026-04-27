#!/bin/bash

# ============================================
# Vidzeno Production Deployment Script
# For DigitalOcean Ubuntu 24.04 LTS
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="vidzeno"
REPO_URL="https://github.com/kushagragoyal18/Vidzeno.git"
APP_DIR="/opt/vidzeno"
NGINX_CONFIG="/etc/nginx/sites-available/vidzeno"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Vidzeno Production Deployment${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root${NC}"
    echo "Usage: sudo ./deploy.sh"
    exit 1
fi

# ============================================
# Step 1: System Update & Dependencies
# ============================================
echo -e "${YELLOW}[1/8] Updating system packages...${NC}"
apt update && apt upgrade -y

echo -e "${YELLOW}[2/8] Installing required dependencies...${NC}"
apt install -y \
    curl \
    git \
    nginx \
    certbot \
    python3-certbot-nginx \
    ca-certificates \
    gnupg \
    lsb-release \
    ufw

# ============================================
# Step 2: Install Docker
# ============================================
echo -e "${YELLOW}[3/8] Installing Docker...${NC}"

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add current user to docker group (if not root)
if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
    usermod -aG docker $SUDO_USER
fi

# Start and enable Docker
systemctl enable docker
systemctl start docker

echo -e "${GREEN}✓ Docker installed successfully${NC}"

# ============================================
# Step 3: Install Docker Compose (standalone)
# ============================================
echo -e "${YELLOW}[4/8] Installing Docker Compose...${NC}"

DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins

curl -SL https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

echo -e "${GREEN}✓ Docker Compose installed${NC}"

# ============================================
# Step 4: Clone Repository
# ============================================
echo -e "${YELLOW}[5/8] Cloning repository...${NC}"

if [ -d "$APP_DIR" ]; then
    echo -e "${YELLOW}Directory $APP_DIR already exists. Pulling latest changes...${NC}"
    cd "$APP_DIR"
    git pull
else
    mkdir -p "$APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
echo -e "${GREEN}✓ Repository ready at $APP_DIR${NC}"

# ============================================
# Step 5: Environment Configuration
# ============================================
echo -e "${YELLOW}[6/8] Configuring environment variables...${NC}"
echo ""

if [ ! -f "$APP_DIR/.env" ]; then
    echo -e "${YELLOW}No .env file found. Creating from template...${NC}"
    cp "$APP_DIR/.env.production" "$APP_DIR/.env"

    echo ""
    echo -e "${RED}============================================${NC}"
    echo -e "${RED}  IMPORTANT: Edit .env file with your values${NC}"
    echo -e "${RED}============================================${NC}"
    echo ""
    echo "The .env file has been created at: $APP_DIR/.env"
    echo ""
    echo -e "${YELLOW}You MUST set the following variables:${NC}"
    echo "  - POSTGRES_PASSWORD"
    echo "  - JWT_SECRET"
    echo "  - SESSION_SECRET"
    echo "  - STRIPE_SECRET_KEY"
    echo "  - STRIPE_PUBLISHABLE_KEY"
    echo "  - STRIPE_WEBHOOK_SECRET"
    echo "  - STRIPE_PRICE_ID_MONTHLY"
    echo "  - STRIPE_PRICE_ID_YEARLY"
    echo "  - DO_SPACES_ACCESS_KEY"
    echo "  - DO_SPACES_SECRET_KEY"
    echo "  - DO_SPACES_BUCKET"
    echo "  - DO_SPACES_ENDPOINT"
    echo "  - GOOGLE_CLIENT_ID (if using Google OAuth)"
    echo "  - GOOGLE_CLIENT_SECRET (if using Google OAuth)"
    echo "  - GITHUB_CLIENT_ID (if using GitHub OAuth)"
    echo "  - GITHUB_CLIENT_SECRET (if using GitHub OAuth)"
    echo ""
    echo -e "${YELLOW}Run: nano $APP_DIR/.env${NC}"
    echo ""
    read -p "Press Enter after you've configured the .env file..."
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# ============================================
# Step 6: Configure Nginx
# ============================================
echo -e "${YELLOW}[7/8] Configuring Nginx...${NC}"

# Create nginx directory if not exists
mkdir -p /etc/nginx/sites-available
mkdir -p /etc/nginx/sites-enabled

# Copy nginx config
if [ -f "$APP_DIR/nginx/vidzeno.conf" ]; then
    cp "$APP_DIR/nginx/vidzeno.conf" "$NGINX_CONFIG"

    # Update server_name in nginx config
    # Domain already configured in nginx/vidzeno.conf for vidzeno.tech
DOMAIN_NAME="vidzeno.tech"

    # Enable site
    ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/vidzeno

    # Remove default site
    rm -f /etc/nginx/sites-enabled/default

    # Test nginx config
    nginx -t

    echo -e "${GREEN}✓ Nginx configured${NC}"
else
    echo -e "${RED}Warning: Nginx config not found at $APP_DIR/nginx/vidzeno.conf${NC}"
fi

# ============================================
# Step 7: Start Docker Services
# ============================================
echo -e "${YELLOW}[8/8] Starting Docker services...${NC}"

cd "$APP_DIR"

# Build and start containers
docker compose -f docker-compose.prod.yml up -d --build

# Wait for services to be healthy
echo "Waiting for services to start..."
sleep 10

# Check container status
docker compose -f docker-compose.prod.yml ps

echo -e "${GREEN}✓ Docker services started${NC}"

# ============================================
# Step 8: Run Database Migrations
# ============================================
echo -e "${YELLOW}Running database migrations...${NC}"

# The backend automatically runs migrations on startup
# Check if backend is healthy
if docker compose -f docker-compose.prod.yml exec -T backend wget --no-verbose --tries=1 --spider http://localhost:3001/health 2>/dev/null; then
    echo -e "${GREEN}✓ Backend is healthy - migrations completed${NC}"
else
    echo -e "${YELLOW}Backend still starting up. Check logs with: docker compose -f docker-compose.prod.yml logs backend${NC}"
fi

# ============================================
# Step 9: Configure Firewall (UFW)
# ============================================
echo -e "${YELLOW}Configuring firewall...${NC}"

ufw allow ssh
ufw allow http
ufw allow https

# Enable UFW (comment out if you prefer to manage firewall manually)
echo "yes" | ufw enable

echo -e "${GREEN}✓ Firewall configured${NC}"

# ============================================
# Step 10: SSL Certificate (Certbot)
# ============================================
echo -e "${YELLOW}Setting up SSL certificate...${NC}"
echo ""
echo "To enable HTTPS, run the following command:"
echo -e "${BLUE}certbot --nginx -d your-domain.com -d www.your-domain.com${NC}"
echo ""
read -p "Run certbot now? (y/n): " RUN_CERTBOT

if [ "$RUN_CERTBOT" = "y" ] || [ "$RUN_CERTBOT" = "Y" ]; then
    # Get domain from nginx config
    DOMAIN_NAME=$(grep -oP 'server_name \K[^;]+' "$NGINX_CONFIG" | awk '{print $1}')

    if [ -n "$DOMAIN_NAME" ]; then
        certbot --nginx -d "$DOMAIN_NAME"
        echo -e "${GREEN}✓ SSL certificate installed${NC}"
    else
        echo -e "${RED}Could not determine domain name. Please run certbot manually.${NC}"
    fi
fi

# ============================================
# Deployment Complete
# ============================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Your application should now be running at:"
echo -e "  HTTP:  ${BLUE}http://$(curl -s ifconfig.me 2>/dev/null || echo 'your-server-ip')${NC}"
echo ""
echo "Useful commands:"
echo -e "  View logs:        ${BLUE}docker compose -f docker-compose.prod.yml logs -f${NC}"
echo -e "  Restart services: ${BLUE}docker compose -f docker-compose.prod.yml restart${NC}"
echo -e "  Stop services:    ${BLUE}docker compose -f docker-compose.prod.yml down${NC}"
echo -e "  View status:      ${BLUE}docker compose -f docker-compose.prod.yml ps${NC}"
echo ""
echo "Next steps:"
echo "  1. Set up Stripe webhook endpoint"
echo "  2. Configure OAuth callback URLs"
echo "  3. Create DigitalOcean Spaces bucket"
echo "  4. Run certbot for SSL (if not done above)"
echo ""
echo "See DEPLOY.md for detailed post-deployment checklist."
echo ""
