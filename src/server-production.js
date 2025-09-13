import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import { Telegraf, Markup } from 'telegraf';
import QRCode from 'qrcode';

// Import Supabase services
import { testConnection } from './config/supabase.js';
import db from './services/database.js';
import paymentCheck from './services/paymentCheck.js';
import orderCleanup from './services/orderCleanup.js';
import { checkAndProcessPendingPayments } from './services/delivery.js';

// Import routes and handlers
import adminRoutes from './routes/admin-fixed.js';
import { handleStart } from './bot/handlers/start.js';
import { renderProductList, renderPopularProducts } from './bot/handlers/products.js';
import { generateOrderId, formatIDR, escapeHtml } from './utils/formatter.js';
import {
  createPayLink,
  createQris,
  tripay as Tripay,
  midtrans as Midtrans
} from './payment/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment validation for production
const requiredEnvVars = [
  'TELEGRAM_BOT_TOKEN',
  'PUBLIC_BASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_PASSWORD',
  'SESSION_SECRET'
];

console.log('🔍 Validating production environment...');
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\n💡 Please check your .env file and add missing variables.');
  process.exit(1);
}

console.log('✅ Environment validation passed');

// Validate payment provider settings
const paymentProvider = process.env.PAYMENT_PROVIDER || 'midtrans';
if (paymentProvider === 'midtrans') {
  if (!process.env.MIDTRANS_SERVER_KEY) {
    console.error('❌ MIDTRANS_SERVER_KEY is required when using Midtrans');
    process.exit(1);
  }
} else if (paymentProvider === 'tripay') {
  if (!process.env.TRIPAY_API_KEY_PRIVATE) {
    console.error('❌ TRIPAY_API_KEY_PRIVATE is required when using Tripay');
    process.exit(1);
  }
}

console.log(`✅ Payment provider: ${paymentProvider}`);

// Test Supabase connection
console.log('🔄 Testing Supabase connection...');
const connected = await testConnection();
if (!connected) {
  console.error('❌ Supabase connection failed. Cannot start in production mode.');
  process.exit(1);
}

console.log('✅ Database connection successful');

// Bot setup
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Admin helpers
const ADMIN_IDS = String(process.env.ADMIN_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isAdminCtx(ctx) {
  const id = ctx?.from?.id ? String(ctx.from.id) : '';
  return ADMIN_IDS.includes(id);
}

function requireAdmin(handler) {
  return async (ctx, ...args) => {
    if (!isAdminCtx(ctx)) {
      return ctx.reply('⛔ Akses ditolak. Fitur ini khusus untuk admin.');
    }
    return handler(ctx, ...args);
  };
}

// Status pesanan
const ORDER_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FULFILLED: 'FULFILLED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED'
};

// Keyboard utama
function mainKeyboard() {
  const top = [
    ['📦 Daftar Produk', '📋 Riwayat Transaksi'],
    ['✨ Produk Populer', '❓ Cara Pemesanan'],
    ['📞 Hubungi Admin']
  ];
  return Markup.keyboard(top).resize().persistent();
}

// Express setup
const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Production security headers
app.use((req, res, next) => {
  // Security headers for production
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // HSTS for HTTPS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
});

// Session configuration for production
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'strict'
  },
  name: 'admin_session' // Custom session name
}));

// Middleware
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf?.toString('utf8') || ''; }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rate limiting for production
if (process.env.NODE_ENV === 'production') {
  const rateLimit = {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: 'Terlalu banyak request dari IP ini, coba lagi nanti.',
    standardHeaders: true,
    legacyHeaders: false,
  };
  
  // Simple rate limiting without external dependency
  const requests = new Map();
  app.use((req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const windowStart = now - rateLimit.windowMs;
    
    if (!requests.has(ip)) {
      requests.set(ip, []);
    }
    
    const userRequests = requests.get(ip).filter(time => time > windowStart);
    userRequests.push(now);
    requests.set(ip, userRequests);
    
    if (userRequests.length > rateLimit.max) {
      return res.status(429).json({ error: rateLimit.message });
    }
    
    next();
  });
  
  console.log('🛡️ Rate limiting enabled for production');
}

// Routes
app.use('/admin', adminRoutes);

// Home route
app.get('/', (req, res) => {
  res.send(`
    <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; min-h-screen; display: flex; flex-direction: column; justify-content: center;">
      <h1 style="font-size: 3rem; margin-bottom: 20px;">🛍️ Toko Digital Indonesia</h1>
      <p style="font-size: 1.2rem; margin-bottom: 30px;">Sistem Marketplace Digital Professional</p>
      <div style="background: rgba(255,255,255,0.1); padding: 30px; border-radius: 15px; max-width: 600px; margin: 0 auto;">
        <h2 style="margin-bottom: 20px;">📊 Panel Admin</h2>
        <p style="margin-bottom: 20px;">Kelola toko digital Anda dengan dashboard admin yang powerful</p>
        <a href="/admin" style="background: white; color: #4154f1; padding: 15px 30px; border-radius: 50px; text-decoration: none; font-weight: bold; display: inline-block; transition: transform 0.3s ease;">
          Masuk Dashboard Admin →
        </a>
      </div>
      <div style="margin-top: 40px; opacity: 0.8;">
        <small>🤖 Bot Telegram: Aktif dan siap melayani pelanggan</small><br>
        <small>📡 Webhook: Siap menerima notifikasi pembayaran</small><br>
        <small>🗄️ Database: Supabase PostgreSQL</small><br>
        <small>🏭 Mode: ${process.env.NODE_ENV || 'development'}</small>
      </div>
    </div>
  `);
});

// Health check with more info for production
app.get('/health', async (req, res) => {
  const dbStatus = await db.testConnection();
  const stats = await db.getManualStats();
  
  res.json({ 
    status: 'OK', 
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bot: bot.telegram ? 'Connected' : 'Disconnected',
    database: dbStatus ? 'Connected' : 'Disconnected',
    paymentProvider: process.env.PAYMENT_PROVIDER || 'midtrans',
    stats: {
      products: stats.totalProducts,
      orders: stats.totalOrders,
      revenue: stats.totalRevenue
    }
  });
});

// [BOT HANDLERS - Same as server-supabase.js]
// ... [Include all bot handlers from server-supabase.js]

// Import all bot handlers from the main server file
import('./server-supabase.js').then(module => {
  // Bot handlers will be initialized by the imported module
}).catch(error => {
  console.error('❌ Failed to import bot handlers:', error);
});

// Webhook endpoints
app.post('/payment/webhook', async (req, res) => {
  const raw = req.rawBody || '';
  const tripaySig = req.header('X-Callback-Signature') || '';
  let parsed, verified = false;

  if (tripaySig && Tripay.verifyWebhook(raw, tripaySig)) {
    parsed = Tripay.parseWebhook(req.body);
    verified = true;
  } else if (Midtrans.verifyWebhook(raw, req.header('X-Signature') || '')) {
    parsed = Midtrans.parseWebhook(JSON.parse(raw || '{}'));
    verified = true;
  }

  if (!verified) {
    console.error('❌ Invalid webhook signature');
    return res.status(403).json({ ok: false, error: 'invalid signature' });
  }
  
  console.log('✅ Valid webhook received:', parsed);
  await handleNormalizedPayment(parsed, res);
});

// Error handling for production
app.use((req, res) => {
  console.log(`404 - ${req.method} ${req.path} from ${req.ip}`);
  res.status(404).render('error', {
    title: '404 - Halaman Tidak Ditemukan',
    message: 'Halaman yang Anda cari tidak ditemukan',
    error: {}
  });
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(err.status || 500).render('error', {
    title: 'Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan server' : err.message,
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Launch server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Production server berjalan di port ${PORT}`);
  console.log(`📊 Admin Dashboard: ${process.env.PUBLIC_BASE_URL}/admin`);
  console.log(`📡 Webhook: ${process.env.PUBLIC_BASE_URL}/payment/webhook`);
  console.log(`🗄️ Database: Supabase PostgreSQL`);
  console.log(`💳 Payment: ${process.env.PAYMENT_PROVIDER || 'midtrans'}`);
  console.log(`🏭 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Launch Telegram bot
bot.launch().then(() => {
  console.log('✅ Production Telegram bot launched!');
  console.log(`🏪 Toko digital ready to serve customers`);
  
  // Production background processes
  
  // Payment checker (every 2 minutes)
  setInterval(async () => {
    try {
      await checkAndProcessPendingPayments(bot);
    } catch (error) {
      console.error('Background payment check error:', error);
    }
  }, 2 * 60 * 1000);
  
  // Gateway-based cleanup (every 15 minutes)
  setInterval(async () => {
    try {
      console.log('\n🔄 [Production] Starting gateway-based cleanup...');
      
      const summary = await orderCleanup.cleanupOrdersBasedOnGatewayStatus(bot);
      const deletedOld = await orderCleanup.cleanupOldOrders(2, bot);
      
      if (summary.processed > 0 || deletedOld > 0) {
        console.log(`🗑️ [Production] Cleanup completed:`);
        console.log(`   📊 Processed: ${summary.processed} orders`);
        console.log(`   ✅ Auto-fulfilled: ${summary.fulfilled} orders`);
        console.log(`   🗑️ Deleted expired: ${summary.deleted} orders`);
        console.log(`   🕐 Deleted old: ${deletedOld} orders`);
      }
    } catch (error) {
      console.error('Background cleanup error:', error);
    }
  }, 15 * 60 * 1000);
  
  console.log('🔄 Production background processes started');
  console.log('   💳 Payment checker: every 2 minutes');
  console.log('   🗑️ Gateway cleanup: every 15 minutes');
});

// Graceful shutdown for production
const gracefulShutdown = (signal) => {
  console.log(`\n🔄 Received ${signal}, shutting down gracefully...`);
  
  bot.stop(signal).then(() => {
    console.log('✅ Telegram bot stopped');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Error stopping bot:', error);
    process.exit(1);
  });
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions in production
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

export default app;
