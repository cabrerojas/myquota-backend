#!/bin/bash
# scripts/vps-setup.sh
# Provision a VPS (Ubuntu 22.04) for myquota-backend deployment.
# Run as root or a user with sudo privileges.
#
# Usage:
#   chmod +x scripts/vps-setup.sh
#   ./scripts/vps-setup.sh
#
# What it does:
#   1. Updates apt and installs nginx, certbot, Node.js 20, git
#   2. Installs PM2 globally
#   3. Creates application directory at /opt/myquota-backend
#   4. Configures nginx reverse proxy on port 80/443
#   5. Sets up Let's Encrypt SSL certificate
#   6. Clones (or instructs how to clone) the repository
#
# Prerequisites:
#   - Ubuntu 22.04 LTS server
#   - SSH access with sudo privileges
#   - Domain name pointed to the server's IP (required for Let's Encrypt)
#   - GitHub repo accessible from the server

set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ─── Variables ────────────────────────────────────────────────────────────────
APP_DIR="/opt/myquota-backend"
APP_USER="ubuntu"
DOMAIN="${DOMAIN:-app.myquota.cl}"
EMAIL="${EMAIL:-admin@myquota.cl}"
NODE_VERSION="22"

# ─── Pre-flight ──────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  log_error "This script must be run as root (or with sudo)"
  exit 1
fi

log_info "Starting VPS provisioning for myquota-backend"
log_info "Domain: $DOMAIN"
log_info "Email: $EMAIL"
log_info "App directory: $APP_DIR"

# ─── 1. System update ─────────────────────────────────────────────────────────
log_info "Updating apt packages..."
apt-get update -y
apt-get upgrade -y

# ─── 2. Install Node.js 20.x ─────────────────────────────────────────────────
log_info "Installing Node.js $NODE_VERSION.x..."
if ! command -v node &> /dev/null; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
else
  log_warn "Node.js already installed: $(node --version)"
fi

# ─── 3. Install PM2 globally ─────────────────────────────────────────────────
log_info "Installing PM2..."
npm install -g pm2

# ─── 4. Create application directory ─────────────────────────────────────────
log_info "Creating application directory at $APP_DIR..."
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/logs"

# Create a non-root user if it doesn't exist
if ! id "$APP_USER" &>/dev/null; then
  log_info "Creating user $APP_USER..."
  useradd -m -s /bin/bash "$APP_USER"
fi

# Set ownership
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ─── 5. Install nginx ─────────────────────────────────────────────────────────
log_info "Installing nginx..."
apt-get install -y nginx

# ─── 6. Configure nginx reverse proxy ────────────────────────────────────────
log_info "Configuring nginx reverse proxy..."

NGINX_CONFIG="/etc/nginx/sites-available/myquota-backend"

cat > "$NGINX_CONFIG" << 'NGINX_EOF'
# HTTP — redirect to HTTPS
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    location / {
        return 301 https://$host$request_uri;
    }

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
}

# HTTPS — reverse proxy to Node.js
server {
    listen 443 ssl;
    server_name DOMAIN_PLACEHOLDER;

    # SSL configuration — replace with your cert paths or use certbot
    # ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
    # ssl_protocols TLSv1.2 TLSv1.3;
    # ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    # ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Reverse proxy
    location / {
        proxy_pass http://127.0.0.1:3000;
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

    # Static files (if serving dist/ directly)
    # location /public/ {
    #     alias /opt/myquota-backend/public/;
    #     expires 7d;
    #     add_header Cache-Control "public, immutable";
    # }

    # Block sensitive paths
    location ~ /\. { deny all; }
}
NGINX_EOF

# Replace placeholder with actual domain
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$NGINX_CONFIG"

# Enable the site
ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/myquota-backend

# Test nginx config
nginx -t && log_info "nginx config is valid" || { log_error "nginx config test failed"; exit 1; }

# Reload nginx
systemctl reload nginx

# ─── 7. Install certbot (Let's Encrypt) ──────────────────────────────────────
log_info "Installing certbot..."
apt-get install -y certbot python3-certbot-nginx

# ─── 8. Obtain SSL certificate ────────────────────────────────────────────────
log_info "Obtaining SSL certificate for $DOMAIN..."
# Stop nginx briefly for certbot standalone validation
systemctl stop nginx

certbot certonly --standalone -d "$DOMAIN" --noninteractive --agree-tos \
  --email "$EMAIL" --key-type ecdsa --elliptic-curve secp384r1

# Re-enable nginx with SSL
systemctl start nginx

# Update nginx config with real cert paths
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"
cat > "$NGINX_CONFIG" << NGINX_EOF
# HTTP — redirect to HTTPS
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        return 301 https://\$host\$request_uri;
    }

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
}

# HTTPS — reverse proxy to Node.js
server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate $CERT_PATH/fullchain.pem;
    ssl_certificate_key $CERT_PATH/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location ~ /\. { deny all; }
}
NGINX_EOF

nginx -t && systemctl reload nginx
log_info "SSL certificate installed and nginx reloaded"

# ─── 9. Certbot auto-renewal ─────────────────────────────────────────────────
log_info "Setting up certbot auto-renewal..."
systemctl timer enable certbot.timer
systemctl start certbot.timer

# ─── 10. PM2 startup script ──────────────────────────────────────────────────
log_info "Configuring PM2 startup hook..."
pm2 startup systemd -u "$APP_USER" --hp "$HOME" 2>/dev/null || true
pm2 save

# ─── 11. Clone repository ────────────────────────────────────────────────────
log_info ""
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_warn "Repository setup — manual step required:"
log_info ""
log_info "  # Clone the repo as $APP_USER:"
log_info "  su - $APP_USER"
log_info "  git clone https://github.com/YOUR_GITHUB_USERNAME/myquota-backend.git $APP_DIR"
log_info "  cd $APP_DIR"
log_info ""
log_info "  # Create production .env file:"
log_info "  cp .env.production.template .env"
log_info "  # Fill in ENCRYPTION_KEY (openssl rand -hex 32) and Supabase credentials"
log_info ""
log_info "  # Install deps and build:"
log_info "  npm ci"
log_info "  npm run build"
log_info ""
log_info "  # Start with PM2:"
log_info "  pm2 start ecosystem.config.js --env production"
log_info "  pm2 save"
log_info ""
log_info "  # Set up GitHub Actions secrets in your repo:"
log_info "  # VPS_HOST, VPS_USER (ubuntu), VPS_SSH_KEY"
log_info ""
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info ""
log_info "Provisioning complete!"
log_info "Remember to add VPS_HOST, VPS_USER, VPS_SSH_KEY to GitHub Actions secrets."