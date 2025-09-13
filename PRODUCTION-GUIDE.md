# 🚀 Production Deployment Guide

## 📋 **Langkah-langkah Deploy ke Production**

### **1. Persiapan Environment**

#### **A. Setup Domain & SSL**
```bash
# Pastikan domain Anda sudah mengarah ke server
# Dan SSL certificate sudah terpasang (Let's Encrypt recommended)
```

#### **B. Copy Environment File**
```bash
# Copy template production ke .env
cp .env.production .env

# Edit .env dengan kredensial production yang benar
nano .env
```

#### **C. Update .env untuk Production**
```env
# WAJIB DIUBAH
NODE_ENV=production
TELEGRAM_BOT_TOKEN=your_production_bot_token
PUBLIC_BASE_URL=https://yourdomain.com

# PAYMENT GATEWAY PRODUCTION
MIDTRANS_IS_PRODUCTION=true
MIDTRANS_SERVER_KEY=your_production_server_key

# SUPABASE PRODUCTION
SUPABASE_URL=https://your-prod-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_production_service_key

# SECURITY
ADMIN_PASSWORD=YourSecurePassword123!
SESSION_SECRET=super-secret-production-key-change-this

# ADMIN INFO
ADMIN_IDS=123456789
ADMIN_CONTACT=@YourAdminUsername
ADMIN_WHATSAPP=+6281234567890
```

### **2. Setup Database Production**

#### **A. Buat Supabase Project Production**
1. Login ke [Supabase](https://supabase.com/dashboard)
2. Klik "New Project"
3. Pilih region: **Singapore** (untuk Indonesia)
4. Buat password database yang kuat
5. Tunggu project selesai dibuat

#### **B. Setup Schema Production**
```bash
# 1. Copy schema ke Supabase SQL Editor
# Buka: https://supabase.com/dashboard/project/YOUR-REF/sql/new
# Copy paste semua isi file: supabase/schema.sql
# Klik RUN

# 2. Test koneksi
npm run test:db
```

### **3. Setup Payment Gateway Production**

#### **A. Midtrans Production**
1. Login ke [Midtrans Dashboard](https://dashboard.midtrans.com)
2. Switch ke **Production** environment
3. Settings → Access Keys:
   - Copy **Server Key** → `MIDTRANS_SERVER_KEY`
   - Copy **Client Key** → `MIDTRANS_CLIENT_KEY`
4. Settings → Configuration:
   - **Payment Notification URL**: `https://yourdomain.com/payment/webhook`
   - **Finish Redirect URL**: `https://yourdomain.com/thanks`
   - **Error Redirect URL**: `https://yourdomain.com/error`
5. Aktifkan payment methods: Credit Card, QRIS, E-Wallet, Bank Transfer

#### **B. Tripay Production** (jika menggunakan Tripay)
1. Login ke [Tripay Dashboard](https://tripay.co.id/member)
2. API → Setting:
   - Copy **API Key** → `TRIPAY_API_KEY_PRIVATE`
   - Copy **Merchant Code** → `TRIPAY_MERCHANT_CODE`
3. Webhook URL: `https://yourdomain.com/tripay/webhook`

### **4. Deploy ke Server**

#### **A. VPS/Server Requirements**
- **OS**: Ubuntu 20.04+ / CentOS 8+
- **Node.js**: v18+ (LTS recommended)
- **Memory**: Minimal 1GB RAM
- **Storage**: Minimal 10GB
- **Network**: Public IP dengan domain

#### **B. Install Dependencies**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 untuk process management
sudo npm install -g pm2

# Install Nginx untuk reverse proxy
sudo apt install nginx -y
```

#### **C. Upload dan Setup Project**
```bash
# Clone/upload project ke server
git clone your-repo.git
cd tokoOnline

# Install dependencies
npm install --production

# Copy environment
cp .env.production .env
# Edit .env dengan kredensial production

# Test aplikasi
npm run test:db
npm run test:gateway
```

### **5. Production Scripts**

#### **A. Update Package.json**
```bash
# Jalankan dengan PM2
npm run start:prod
```

#### **B. Setup PM2 Ecosystem**
```bash
# Buat file ecosystem.config.js
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'toko-digital',
    script: 'src/server-production.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

# Start dengan PM2
mkdir logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### **6. Setup Nginx Reverse Proxy**

```nginx
# /etc/nginx/sites-available/toko-digital
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

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
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/toko-digital /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### **7. Setup SSL Certificate**

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

### **8. Setup Monitoring**

```bash
# Monitor logs
pm2 logs toko-digital

# Monitor processes
pm2 monit

# Restart if needed
pm2 restart toko-digital

# Check status
pm2 status
```

### **9. Webhook Testing**

```bash
# Test webhook endpoints
curl -X POST https://yourdomain.com/health

# Check webhook logs
tail -f logs/out.log | grep webhook
```

## 🔧 **Mode Switching Commands**

### **Development Mode:**
```bash
npm run dev           # Development dengan file watching
npm run start:dev     # Development tanpa watching
```

### **Production Mode:**
```bash
npm run start:prod    # Production dengan NODE_ENV=production
pm2 start ecosystem.config.js  # Production dengan PM2
```

## 🛡️ **Production Security Checklist**

- ✅ HTTPS dengan SSL certificate
- ✅ Strong admin password
- ✅ Secure session secret
- ✅ Rate limiting enabled
- ✅ Security headers
- ✅ Error logging
- ✅ Database connection encryption
- ✅ Webhook signature verification
- ✅ Input validation
- ✅ CORS configuration

## 📊 **Production Monitoring**

### **Health Check:**
```
GET https://yourdomain.com/health
```

### **Admin Dashboard:**
```
https://yourdomain.com/admin
```

### **Bot Commands:**
- Test bot dengan `/start`
- Test product catalog
- Test payment flow
- Test admin functions

## 🚨 **Troubleshooting Production**

### **Bot tidak response:**
```bash
pm2 logs toko-digital | grep telegram
```

### **Webhook tidak jalan:**
```bash
tail -f logs/out.log | grep webhook
curl -X POST https://yourdomain.com/payment/webhook
```

### **Database error:**
```bash
npm run test:db
```

### **Payment gateway error:**
```bash
npm run test:gateway
```

---

## 🎯 **Quick Production Setup**

1. **Copy environment**: `cp .env.production .env`
2. **Update credentials** di `.env`
3. **Setup database**: Run `supabase/schema.sql` di SQL Editor
4. **Test**: `npm run test:db && npm run test:gateway`
5. **Deploy**: `npm run start:prod`
6. **Monitor**: `pm2 logs`

Production deployment selesai! 🎉
