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

// Environment variables
const { TELEGRAM_BOT_TOKEN, PUBLIC_BASE_URL } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN tidak ditemukan di .env');
  process.exit(1);
}

if (!PUBLIC_BASE_URL) {
  console.error('❌ PUBLIC_BASE_URL tidak ditemukan di .env');
  process.exit(1);
}

// Test Supabase connection
console.log('🔄 Testing Supabase connection...');
const connected = await testConnection();
if (!connected) {
  console.error('❌ Supabase connection failed. Check your .env configuration.');
  process.exit(1);
}

// Bot setup
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

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

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: true, // Changed to true for debugging
  cookie: {
    secure: false, // Always false for localhost testing
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true
  },
  name: 'toko_session'
}));

// Debug session middleware
app.use('/admin', (req, res, next) => {
  console.log(`[SESSION DEBUG] ${req.method} ${req.path}`);
  console.log(`[SESSION DEBUG] Session ID: ${req.sessionID}`);
  console.log(`[SESSION DEBUG] Session Data:`, req.session);
  console.log(`[SESSION DEBUG] Admin Password in Session:`, req.session?.adminPassword);
  next();
});

// Middleware
app.use(morgan('combined'));
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf?.toString('utf8') || ''; }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes
app.use('/admin', adminRoutes);

// Home route
app.get('/', (req, res) => {
  res.send(`
    <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; min-height: 100vh; display: flex; flex-direction: column; justify-content: center;">
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
        <small>🗄️ Database: Supabase (PostgreSQL)</small>
      </div>
    </div>
  `);
});

// Health check
app.get('/health', async (req, res) => {
  const dbStatus = await db.testConnection();
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bot: bot.telegram ? 'Connected' : 'Disconnected',
    database: dbStatus ? 'Connected' : 'Disconnected'
  });
});

// Bot handlers
bot.start(async (ctx) => {
  const telegramId = String(ctx.from.id);
  
  // Upsert user using Supabase
  await db.upsertUser(telegramId, {
    username: ctx.from.username || null,
    first_name: ctx.from.first_name || null,
    last_name: ctx.from.last_name || null
  });

  const welcomeMessage = 
    `Selamat datang, ${escapeHtml(ctx.from.first_name || 'Pelanggan')}! 👋\n\n` +
    `🛍️ <b>Toko Digital Indonesia</b>\n` +
    `Tempat terbaik untuk produk digital berkualitas\n\n` +
    `<b>Menu Utama:</b>\n` +
    `📦 Lihat daftar produk\n` +
    `📋 Cek riwayat transaksi\n` +
    `✨ Produk terlaris\n` +
    `❓ Panduan pemesanan\n` +
    `📞 Hubungi admin jika butuh bantuan`;

  await ctx.reply(welcomeMessage, {
    parse_mode: 'HTML',
    reply_markup: mainKeyboard().reply_markup
  });
});

// Menu commands
bot.command('help', async (ctx) => {
  await ctx.reply(
    '📖 <b>Panduan Menggunakan Bot:</b>\n\n' +
    '📦 <b>Daftar Produk</b> - Lihat semua produk tersedia\n' +
    '📋 <b>Riwayat Transaksi</b> - Cek pesanan Anda\n' +
    '✨ <b>Produk Populer</b> - Produk terlaris\n' +
    '❓ <b>Cara Pemesanan</b> - Panduan order\n' +
    '📞 <b>Hubungi Admin</b> - Butuh bantuan?\n\n' +
    '<i>Gunakan tombol menu di bawah untuk navigasi mudah! 👇</i>',
    { parse_mode: 'HTML' }
  );
});

bot.command('products', async (ctx) => {
  const products = await db.getProducts({ 
    isActive: true, 
    limit: 6, 
    orderBy: { column: 'id', ascending: true }
  });
  
  if (!products.length) {
    return ctx.reply('📦 Belum ada produk tersedia.');
  }
  
  const productsWithStock = await Promise.all(
    products.map(async (product) => ({
      ...product,
      stock: await db.getProductStock(product.id)
    }))
  );
  
  // Use existing renderProductList logic but with Supabase data
  return renderProductList(ctx, 1);
});

bot.command('popular', (ctx) => renderPopularProducts(ctx));

// Text message handlers
bot.hears('📦 Daftar Produk', async (ctx) => renderProductList(ctx, 1));
bot.hears('📋 Riwayat Transaksi', async (ctx) => {
  const user = await db.getUserByTelegramId(String(ctx.from.id));
  
  if (!user) {
    return ctx.reply('❌ Data user tidak ditemukan.');
  }

  const orders = await db.getOrdersByUserId(user.id, { limit: 10 });
  
  if (!orders.length) {
    return ctx.reply('📭 Belum ada riwayat transaksi.\n\nMulai berbelanja sekarang! 🛒');
  }

  const lines = ['📋 <b>RIWAYAT TRANSAKSI</b>\n'];
  orders.forEach((order, index) => {
    const status = order.status === 'FULFILLED' ? '✅' : 
                  order.status === 'PENDING' ? '⏳' : '❌';
    lines.push(`${index + 1}. ${status} ${order.products?.name || '-'}`);
    lines.push(`   💰 ${formatIDR(order.price_idr)} - ${order.status}`);
    lines.push(`   🆔 <code>${order.order_id}</code>\n`);
  });

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
});

bot.hears('✨ Produk Populer', async (ctx) => renderPopularProducts(ctx));
bot.hears('❓ Cara Pemesanan', (ctx) => 
  ctx.reply(
    '📝 <b>CARA PEMESANAN:</b>\n\n' +
    '1️⃣ Pilih <b>📦 Daftar Produk</b>\n' +
    '2️⃣ Klik produk yang diinginkan\n' +
    '3️⃣ Tekan tombol <b>🛒 Beli Sekarang</b>\n' +
    '4️⃣ Pilih metode pembayaran\n' +
    '5️⃣ Lakukan pembayaran\n' +
    '6️⃣ Produk akan dikirim otomatis! ✨\n\n' +
    '<i>💡 Tips: Gunakan QRIS untuk pembayaran lebih cepat</i>',
    { parse_mode: 'HTML' }
  )
);

bot.hears('📞 Hubungi Admin', (ctx) =>
  ctx.reply(
    '👨‍💼 <b>HUBUNGI ADMIN</b>\n\n' +
    '📞 Butuh bantuan? Tim support siap membantu!\n\n' +
    '💬 <b>Kontak Admin:</b>\n' +
    `• Telegram: ${process.env.ADMIN_CONTACT || '@admin'}\n` +
    `• WhatsApp: ${process.env.ADMIN_WHATSAPP || '+62xxx-xxxx-xxxx'}\n` +
    `• Email: ${process.env.ADMIN_EMAIL || 'admin@tokoonline.com'}\n\n` +
    '⏰ <b>Jam Operasional:</b>\n' +
    'Senin - Minggu: 08:00 - 22:00 WIB\n\n' +
    '<i>Kami akan merespons dalam 1-2 jam</i> ⚡',
    { parse_mode: 'HTML' }
  )
);

// Admin commands
bot.command('admin', requireAdmin(async (ctx) => {
  const stats = await db.getDashboardStats();
  
  await ctx.reply(
    '👑 <b>Panel Admin</b>\n\n' +
    `📊 <b>Statistik:</b>\n` +
    `📦 Total Produk: ${stats.totalProducts}\n` +
    `📋 Total Pesanan: ${stats.totalOrders}\n` +
    `✅ Pesanan Selesai: ${stats.fulfilledOrders}\n` +
    `💰 Total Pendapatan: ${formatIDR(stats.totalRevenue)}\n\n` +
    `🌐 <b>Dashboard Web:</b> ${PUBLIC_BASE_URL}/admin`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 Buka Dashboard Web', url: `${PUBLIC_BASE_URL}/admin` }]
        ]
      }
    }
  );
}));

// Handle product purchase
async function handleBuy(ctx, slug) {
  try {
    console.log('Looking for product with slug:', slug);
    const product = await db.getProductBySlug(slug);
    console.log('Found product:', product);
    
    if (!product || !product.is_active) {
      return ctx.reply('❌ Produk tidak ditemukan atau sedang tidak aktif.');
    }

  const stock = await db.getProductStock(product.id);
  
  if (stock <= 0) {
    return ctx.reply('📦 Maaf, stok produk sedang kosong.\n\n📞 Hubungi admin untuk informasi restok.');
  }

  const telegramId = String(ctx.from.id);
  let user;
  try {
    user = await db.upsertUser(telegramId, {
      username: ctx.from.username || null,
      first_name: ctx.from.first_name || null,
      last_name: ctx.from.last_name || null
    });
  } catch (userError) {
    console.error('User upsert error:', userError);
    // Try to get existing user
    user = await db.getUserByTelegramId(telegramId);
    if (!user) {
      return ctx.reply('❌ Terjadi kesalahan sistem. Silakan coba lagi.');
    }
  }

  const orderId = generateOrderId('ORD');
  const order = await db.createOrder({
    order_id: orderId,
    user_id: user.id,
    product_id: product.id,
    price_idr: product.price_idr,
    status: ORDER_STATUS.PENDING
  });

  // Try to create payment link
  let paymentLink = null;
  try {
    const payLinkResult = await createPayLink({
      orderId: order.order_id,
      amount: order.price_idr,
      customer: {
        name: `${user.first_name || 'Telegram'} ${user.last_name || 'User'}`.trim(),
        email: `${user.username || 'user'}@telegram.local`
      },
      items: [{ 
        sku: product.slug, 
        name: product.name, 
        price: order.price_idr, 
        quantity: 1 
      }],
      callbackUrl: `${process.env.PUBLIC_BASE_URL}/payment/webhook`,
      returnUrl: `${process.env.PUBLIC_BASE_URL}/thanks?o=${order.order_id}`
    });
    paymentLink = payLinkResult.checkoutUrl;
  } catch (linkError) {
    console.error('Payment link creation failed:', linkError.message);
  }

  // Prepare payment options
  const paymentButtons = [];
  
  // Add Snap payment link if available
  if (paymentLink) {
    paymentButtons.push([{ 
      text: '💳 Bayar via Snap (Semua Metode)', 
      url: paymentLink 
    }]);
  }
  
  // Always add QRIS option (will handle error gracefully)
  paymentButtons.push([{ 
    text: '🟦 QRIS (Scan QR Code)', 
    callback_data: `PAY_QRIS_${order.order_id}` 
  }]);

  // Add manual check status button
  paymentButtons.push([{ 
    text: '🔄 Cek Status Pembayaran', 
    callback_data: `CHK_${order.order_id}` 
  }]);

  await ctx.reply(
    `🧾 <b>Pesanan ${escapeHtml(product.name)}</b>\n\n` +
    `💰 Total: ${formatIDR(product.price_idr)}\n` +
    `🆔 Order ID: <code>${order.order_id}</code>\n\n` +
    `⚡ Pilih metode pembayaran:\n\n` +
    `💡 <b>Setelah bayar:</b>\n` +
    `• Tunggu 1-2 menit untuk notifikasi otomatis\n` +
    `• Atau klik "Cek Status Pembayaran" untuk update manual`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: paymentButtons
      }
    }
  );
  } catch (error) {
    console.error('Handle buy error:', error);
    await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi atau hubungi admin.');
  }
}

// Callback query handler
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery?.data || '';

  // Handle catalog navigation
  if (data.startsWith('CATALOG_')) {
    const page = parseInt(data.replace('CATALOG_', '')) || 1;
    await ctx.answerCbQuery();
    return renderProductList(ctx, page, ctx.callbackQuery.message.message_id);
  }

  // Handle product info
  if (data.startsWith('INFO_') || data.startsWith('POPINFO_')) {
    const slug = data.includes('_p') ? 
      data.substring(5, data.lastIndexOf('_p')) : 
      data.replace(/^(INFO_|POPINFO_)/, '');
    
    const product = await db.getProductBySlug(slug);
    if (!product) {
      return ctx.answerCbQuery('❌ Produk tidak ditemukan', { show_alert: true });
    }

    const stock = await db.getProductStock(product.id);
    const statusIcon = stock > 0 ? '🟢' : '🔴';
    const statusText = stock > 0 ? 'Tersedia' : 'Stok Habis';

    await ctx.answerCbQuery();
    await ctx.reply(
      `🛍️ <b>${escapeHtml(product.name)}</b>\n\n` +
      `📝 ${escapeHtml(product.description || 'Produk digital berkualitas')}\n\n` +
      `💰 <b>Harga:</b> ${formatIDR(product.price_idr)}\n` +
      `📦 <b>Stok:</b> ${statusIcon} ${statusText} (${stock})\n\n` +
      `${stock > 0 ? '✨ Siap untuk pembelian!' : '⏳ Segera restok!'}`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            stock > 0 ? [{ text: '🛒 Beli Sekarang', callback_data: `BUY_${product.slug}` }] : [],
            [{ text: '🔙 Kembali ke Katalog', callback_data: 'CATALOG_1' }]
          ].filter(row => row.length > 0)
        }
      }
    );
    return;
  }

  // Handle purchase
  if (data.startsWith('BUY_')) {
    const slug = data.replace('BUY_', '');
    await ctx.answerCbQuery('🛒 Memproses pesanan...');
    return handleBuy(ctx, slug);
  }

  // Handle QRIS payment
  if (data.startsWith('PAY_QRIS_')) {
    const orderId = data.replace('PAY_QRIS_', '');
    try {
      const order = await db.getOrderByOrderId(orderId);

      if (!order) {
        return ctx.answerCbQuery('❌ Pesanan tidak ditemukan', { show_alert: true });
      }

      await ctx.answerCbQuery('⏳ Membuat QRIS...');
      
      const qrisResult = await createQris({
        orderId: order.order_id,
        amount: order.price_idr
      });

      if (qrisResult.qrString) {
        const qrBuffer = await QRCode.toBuffer(qrisResult.qrString, { width: 400, margin: 1 });
        
        await ctx.replyWithPhoto({ source: qrBuffer }, {
          caption:
            `📱 <b>Scan QRIS untuk bayar</b>\n\n` +
            `🛍️ ${escapeHtml(order.products.name)}\n` +
            `💰 ${formatIDR(order.price_idr)}\n\n` +
            `⏰ QR berlaku 15 menit\n` +
            `✨ Produk dikirim otomatis setelah bayar`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Cek Status Pembayaran', callback_data: `CHK_${order.order_id}` }]
            ]
          }
        });
      } else {
        throw new Error('QRIS tidak tersedia - channel pembayaran belum aktif');
      }
    } catch (error) {
      console.error('QRIS Error:', error);
      
      // Send error message with alternative options
      await ctx.reply(
        `❌ <b>QRIS Tidak Tersedia</b>\n\n` +
        `Maaf, QRIS sedang bermasalah:\n` +
        `<i>${error.message || 'Channel pembayaran belum aktif'}</i>\n\n` +
        `💡 <b>Solusi:</b>\n` +
        `• Hubungi admin untuk aktivasi QRIS\n` +
        `• Gunakan metode pembayaran lain\n` +
        `• Coba lagi nanti\n\n` +
        `📞 <b>Kontak Admin:</b>\n` +
        `• Telegram: ${process.env.ADMIN_CONTACT || '@admin'}\n` +
        `• WhatsApp: ${process.env.ADMIN_WHATSAPP || '+62xxx-xxxx-xxxx'}`,
        { 
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Kembali ke Pesanan', callback_data: `ORDER_${orderId}` }],
              [{ text: '📞 Hubungi Admin', callback_data: 'CONTACT_ADMIN' }]
            ]
          }
        }
      );
    }
    return;
  }

  // Handle order back button
  if (data.startsWith('ORDER_')) {
    const orderId = data.replace('ORDER_', '');
    try {
      const order = await db.getOrderByOrderId(orderId);
      if (!order) {
        return ctx.answerCbQuery('❌ Pesanan tidak ditemukan', { show_alert: true });
      }

      await ctx.answerCbQuery();
      await ctx.reply(
        `🧾 <b>Pesanan ${escapeHtml(order.products.name)}</b>\n\n` +
        `💰 Total: ${formatIDR(order.price_idr)}\n` +
        `🆔 Order ID: <code>${order.order_id}</code>\n` +
        `📊 Status: ${order.status}\n\n` +
        `Silakan pilih metode pembayaran lain atau hubungi admin.`,
        { 
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📞 Hubungi Admin', callback_data: 'CONTACT_ADMIN' }],
              [{ text: '🏠 Kembali ke Menu', callback_data: 'BACK_TO_MENU' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Order back error:', error);
      await ctx.answerCbQuery('❌ Terjadi kesalahan', { show_alert: true });
    }
    return;
  }

  // Handle contact admin
  if (data === 'CONTACT_ADMIN') {
    await ctx.answerCbQuery();
    await ctx.reply(
      '👨‍💼 <b>HUBUNGI ADMIN</b>\n\n' +
      '📞 Butuh bantuan? Tim support siap membantu!\n\n' +
      '💬 <b>Kontak Admin:</b>\n' +
      `• Telegram: ${process.env.ADMIN_CONTACT || '@admin'}\n` +
      `• WhatsApp: ${process.env.ADMIN_WHATSAPP || '+62xxx-xxxx-xxxx'}\n` +
      `• Email: ${process.env.ADMIN_EMAIL || 'admin@tokoonline.com'}\n\n` +
      '⏰ <b>Jam Operasional:</b>\n' +
      'Senin - Minggu: 08:00 - 22:00 WIB\n\n' +
      '💡 <b>Untuk masalah pembayaran:</b>\n' +
      'Sertakan Order ID Anda saat menghubungi admin.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Handle back to menu
  if (data === 'BACK_TO_MENU') {
    await ctx.answerCbQuery();
    await ctx.reply(
      '🏠 <b>Menu Utama</b>\n\nSilakan pilih menu yang Anda inginkan:',
      { 
        parse_mode: 'HTML',
        reply_markup: mainKeyboard().reply_markup
      }
    );
    return;
  }

  // Handle payment status check (Manual)
  if (data.startsWith('CHK_')) {
    const orderId = data.replace('CHK_', '');
    
    try {
      await ctx.answerCbQuery('🔄 Mengecek status pembayaran...');
      
      const result = await paymentCheck.manualPaymentCheck(orderId);
      
      if (result.status === 'FULFILLED' && result.credential) {
        // Send product to user
        await ctx.reply(
          `🎉 <b>Pembayaran Berhasil!</b>\n\n` +
          `🛍️ <b>Produk:</b> ${escapeHtml(result.order.products.name)}\n` +
          `💰 <b>Total:</b> ${formatIDR(result.order.price_idr)}\n\n` +
          `🎁 <b>Data Produk Anda:</b>\n` +
          `<pre><code>${escapeHtml(result.credential)}</code></pre>\n\n` +
          `✨ Terima kasih telah berbelanja! Semoga bermanfaat.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (result.status === 'DELETED') {
        await ctx.reply(
          `🗑️ <b>Pesanan Dihapus</b>\n\n` +
          `${result.message}\n\n` +
          `💡 <b>Silakan pesan ulang jika masih membutuhkan produk ini.</b>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🛒 Pesan Ulang', callback_data: 'CATALOG_1' }],
                [{ text: '🏠 Menu Utama', callback_data: 'BACK_TO_MENU' }]
              ]
            }
          }
        );
        return;
      }

      // Show status update
      const statusEmoji = {
        'PENDING': '⏳',
        'PAID': '💰', 
        'FULFILLED': '✅',
        'FAILED': '❌',
        'CANCELED': '🚫'
      };

      const statusText = {
        'PENDING': 'Menunggu Pembayaran',
        'PAID': 'Sudah Dibayar (Sedang Diproses)',
        'FULFILLED': 'Selesai',
        'FAILED': 'Gagal',
        'CANCELED': 'Dibatalkan'
      };

      await ctx.reply(
        `📊 <b>Status Pembayaran Real-Time</b>\n\n` +
        `🧾 <b>Pesanan:</b> ${escapeHtml(result.order.products?.name || 'Unknown')}\n` +
        `🆔 <b>Order ID:</b> <code>${result.order.order_id}</code>\n` +
        `💰 <b>Total:</b> ${formatIDR(result.order.price_idr)}\n` +
        `📈 <b>Status:</b> ${statusEmoji[result.status] || '❓'} ${statusText[result.status] || result.status}\n` +
        `${result.gatewayInfo ? `🏦 <b>Gateway:</b> ${result.gatewayInfo.status} (${process.env.PAYMENT_PROVIDER || 'midtrans'})\n` : ''}\n` +
        `${result.message}\n\n` +
        `${result.status === 'PENDING' ? 
          '💡 <b>Tips:</b>\n• Pastikan pembayaran sudah selesai di app/web\n• Status dicek langsung dari payment gateway\n• Tunggu 1-3 menit atau cek lagi' :
          result.status === 'DELETED' ? 
          '🆘 <b>Bantuan:</b>\nPesanan dihapus karena pembayaran gagal.\nAnda bisa memesan ulang produk yang sama.' :
          ''
        }`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              result.status === 'PENDING' ? [
                { text: '🔄 Cek Lagi', callback_data: `CHK_${result.order.order_id}` },
                { text: '📞 Hubungi Admin', callback_data: 'CONTACT_ADMIN' }
              ] : result.status === 'DELETED' ? [
                { text: '🛒 Pesan Ulang', callback_data: 'CATALOG_1' },
                { text: '📞 Hubungi Admin', callback_data: 'CONTACT_ADMIN' }
              ] : [
                { text: '🏠 Menu Utama', callback_data: 'BACK_TO_MENU' }
              ]
            ]
          }
        }
      );
      
    } catch (error) {
      console.error('Payment check error:', error);
      await ctx.reply(
        '❌ Gagal mengecek status pembayaran.\n\n' +
        'Error: ' + error.message + '\n\n' +
        'Silakan coba lagi atau hubungi admin.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Coba Lagi', callback_data: `CHK_${orderId}` }],
              [{ text: '📞 Hubungi Admin', callback_data: 'CONTACT_ADMIN' }]
            ]
          }
        }
      );
    }
    return;
  }
});

// Payment webhook handler
async function notifyUser(telegramId, message, html = false) {
  try {
    await bot.telegram.sendMessage(telegramId, message, html ? { parse_mode: 'HTML' } : undefined);
  } catch (e) {
    console.error('Notify user error:', e.message);
  }
}

async function handleNormalizedPayment(parsed, res) {
  const { orderId, status, provider } = parsed;

  const order = await db.getOrderByOrderId(orderId);
  
  if (!order) return res.status(404).json({ ok: false });

  const paid = (provider === 'tripay') ? Tripay.isPaid(status) : Midtrans.isPaid(status);

  if (paid && order.status !== ORDER_STATUS.FULFILLED) {
    // Update order status to PAID
    if (order.status !== ORDER_STATUS.PAID) {
      await db.updateOrderByOrderId(orderId, { status: ORDER_STATUS.PAID });
    }

    // Find available credential
    const credential = await db.getUnusedCredential(order.product_id);

    if (!credential) {
      await notifyUser(order.users.telegram_id,
        `✅ Pembayaran <b>${escapeHtml(order.products.name)}</b> berhasil!\n\n` +
        `❌ Namun stok sedang kosong. Admin akan segera menindaklanjuti.`,
        true
      );
      return res.json({ ok: true, note: 'Paid, no stock' });
    }

    // Mark credential as used
    await db.useCredential(credential.id);

    // Update order to fulfilled
    await db.updateOrderByOrderId(orderId, {
      status: ORDER_STATUS.FULFILLED,
      delivered_payload: credential.payload
    });

    // Send product to user
    const message =
      `🎉 <b>Pembayaran Berhasil!</b>\n\n` +
      `🛍️ <b>Produk:</b> ${escapeHtml(order.products.name)}\n` +
      `💰 <b>Total:</b> ${formatIDR(order.price_idr)}\n\n` +
      `🎁 <b>Data Produk Anda:</b>\n` +
      `<pre><code>${escapeHtml(credential.payload)}</code></pre>\n\n` +
      `✨ Terima kasih telah berbelanja! Semoga bermanfaat.`;
      
    await notifyUser(order.users.telegram_id, message, true);
    return res.json({ ok: true });
  }

  // Handle failed payments - DELETE instead of update
  const failSet = new Set(['FAILED', 'EXPIRED', 'REFUND', 'CANCEL', 'DENY', 'EXPIRE', 'FAILURE']);
  if (failSet.has(String(status).toUpperCase())) {
    console.log(`Payment failed for order ${orderId}, deleting from database...`);
    
    // Notify user before deleting
    await notifyUser(
      order.users.telegram_id,
      `❌ <b>Pembayaran Gagal</b>\n\n` +
      `Transaksi <b>${escapeHtml(order.products.name)}</b> ${String(status).toUpperCase()}.\n\n` +
      `💡 <b>Yang dapat Anda lakukan:</b>\n` +
      `• Coba pesan ulang produk yang sama\n` +
      `• Gunakan metode pembayaran berbeda\n` +
      `• Hubungi admin jika ada masalah\n\n` +
      `📞 <b>Kontak Admin:</b>\n` +
      `• Telegram: ${process.env.ADMIN_CONTACT || '@admin'}\n` +
      `• WhatsApp: ${process.env.ADMIN_WHATSAPP || '+62xxx-xxxx-xxxx'}`,
      true
    );
    
    // Delete failed order from database
    await db.deleteOrder(orderId);
    
    return res.json({ ok: true, status, action: 'deleted' });
  }

  return res.json({ ok: true, status });
}

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

  if (!verified) return res.status(403).json({ ok: false, error: 'invalid signature' });
  await handleNormalizedPayment(parsed, res);
});

// Set bot commands
bot.telegram.setMyCommands([
  { command: 'start', description: '🏠 Mulai menggunakan bot' },
  { command: 'products', description: '📦 Lihat daftar produk' },
  { command: 'popular', description: '✨ Produk terlaris' },
  { command: 'help', description: '❓ Bantuan penggunaan' },
  { command: 'admin', description: '👑 Panel admin (khusus admin)' }
]);

// Error handling
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Halaman Tidak Ditemukan',
    message: 'Halaman yang Anda cari tidak ditemukan',
    error: {}
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).render('error', {
    title: 'Error',
    message: err.message || 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Launch server and bot
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  console.log(`📊 Admin Dashboard: http://localhost:${PORT}/admin`);
  console.log(`📡 Webhook: http://localhost:${PORT}/payment/webhook`);
  console.log(`🗄️ Database: Supabase PostgreSQL`);
});

// Launch Telegram bot
bot.launch().then(() => {
  console.log('✅ Telegram bot berhasil dijalankan!');
  console.log(`🏪 Toko digital siap melayani pelanggan dengan Supabase`);
  
  // Start background payment checker (every 2 minutes)
  setInterval(async () => {
    try {
      await checkAndProcessPendingPayments(bot);
    } catch (error) {
      console.error('Background payment check error:', error);
    }
  }, 2 * 60 * 1000); // 2 minutes
  
  // Start gateway-based cleanup process (every 15 minutes)
  setInterval(async () => {
    try {
      console.log('\n🔄 [Background] Starting gateway-based cleanup...');
      
      // STEP 1: Cleanup based on current gateway status
      const summary = await orderCleanup.cleanupOrdersBasedOnGatewayStatus(bot);
      
      // STEP 2: Cleanup old orders (2+ hours old)
      const deletedOld = await orderCleanup.cleanupOldOrders(2, bot);
      
      if (summary.processed > 0 || deletedOld > 0) {
        console.log(`🗑️ [Background] Cleanup completed:`);
        console.log(`   📊 Processed: ${summary.processed} orders`);
        console.log(`   ✅ Auto-fulfilled: ${summary.fulfilled} orders`);
        console.log(`   🗑️ Deleted expired: ${summary.deleted} orders`);
        console.log(`   🕐 Deleted old: ${deletedOld} orders`);
      }
    } catch (error) {
      console.error('Background cleanup error:', error);
    }
  }, 15 * 60 * 1000); // 15 minutes
  
  console.log('🔄 Background payment checker started (every 2 minutes)');
  console.log('🗑️ Gateway-based cleanup started (every 15 minutes)');
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('🔄 Shutting down gracefully...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🔄 Shutting down gracefully...');
  bot.stop('SIGTERM');
  process.exit(0);
});

export default app;
