import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import { Telegraf, Markup } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';

// Import routes and handlers
import adminRoutes from './routes/admin.js';
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

// Initialize
const prisma = new PrismaClient();
const app = express();

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
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

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
        <small>📡 Webhook: Siap menerima notifikasi pembayaran</small>
      </div>
    </div>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bot: bot.telegram ? 'Connected' : 'Disconnected'
  });
});

// Bot handlers
bot.start(handleStart);

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

bot.command('products', (ctx) => renderProductList(ctx, 1));
bot.command('popular', (ctx) => renderPopularProducts(ctx));

// Text message handlers
bot.hears('📦 Daftar Produk', async (ctx) => renderProductList(ctx, 1));
bot.hears('📋 Riwayat Transaksi', async (ctx) => {
  const user = await prisma.user.findUnique({ 
    where: { telegramId: String(ctx.from.id) } 
  });
  
  if (!user) {
    return ctx.reply('❌ Data user tidak ditemukan.');
  }

  const orders = await prisma.order.findMany({ 
    where: { userId: user.id }, 
    orderBy: { createdAt: 'desc' }, 
    take: 10, 
    include: { product: true } 
  });
  
  if (!orders.length) {
    return ctx.reply('📭 Belum ada riwayat transaksi.\n\nMulai berbelanja sekarang! 🛒');
  }

  const lines = ['📋 <b>RIWAYAT TRANSAKSI</b>\n'];
  orders.forEach((order, index) => {
    const status = order.status === 'FULFILLED' ? '✅' : 
                  order.status === 'PENDING' ? '⏳' : '❌';
    lines.push(`${index + 1}. ${status} ${order.product?.name || '-'}`);
    lines.push(`   💰 ${formatIDR(order.priceIDR)} - ${order.status}`);
    lines.push(`   🆔 <code>${order.orderId}</code>\n`);
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
    '• Telegram: @YourAdminUsername\n' +
    '• WhatsApp: +62xxx-xxxx-xxxx\n' +
    '• Email: support@tokoonline.com\n\n' +
    '⏰ <b>Jam Operasional:</b>\n' +
    'Senin - Minggu: 08:00 - 22:00 WIB\n\n' +
    '<i>Kami akan merespons dalam 1-2 jam</i> ⚡',
    { parse_mode: 'HTML' }
  )
);

// Admin commands
bot.command('admin', requireAdmin(async (ctx) => {
  await ctx.reply(
    '👑 <b>Panel Admin</b>\n\nPilih aksi yang ingin dilakukan:',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Statistik Toko', callback_data: 'ADMIN_STATS' }],
          [{ text: '🌐 Dashboard Web', url: `${PUBLIC_BASE_URL}/admin` }]
        ]
      }
    }
  );
}));

// Handle product purchase
async function handleBuy(ctx, slug) {
  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product || !product.isActive) {
    return ctx.reply('❌ Produk tidak ditemukan atau sedang tidak aktif.');
  }

  const stock = await prisma.productCredential.count({ 
    where: { productId: product.id, isUsed: false } 
  });
  
  if (stock <= 0) {
    return ctx.reply('📦 Maaf, stok produk sedang kosong.\n\n📞 Hubungi admin untuk informasi restok.');
  }

  const telegramId = String(ctx.from.id);
  const user = await prisma.user.upsert({
    where: { telegramId },
    update: { 
      username: ctx.from.username || null, 
      firstName: ctx.from.first_name || null, 
      lastName: ctx.from.last_name || null 
    },
    create: { 
      telegramId, 
      username: ctx.from.username || null, 
      firstName: ctx.from.first_name || null, 
      lastName: ctx.from.last_name || null 
    }
  });

  const orderId = generateOrderId('ORD');
  const order = await prisma.order.create({
    data: {
      orderId,
      userId: user.id,
      productId: product.id,
      priceIDR: product.priceIDR,
      status: ORDER_STATUS.PENDING
    }
  });

  await ctx.reply(
    `🧾 <b>Pesanan ${escapeHtml(product.name)}</b>\n\n` +
    `💰 Total: ${formatIDR(product.priceIDR)}\n` +
    `🆔 Order ID: <code>${order.orderId}</code>\n\n` +
    `⚡ Pilih metode pembayaran:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🟦 QRIS (Tampilkan QR)', callback_data: `PAY_QRIS_${order.orderId}` }]
        ]
      }
    }
  );
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
    
    const product = await prisma.product.findUnique({ where: { slug } });
    if (!product) {
      return ctx.answerCbQuery('❌ Produk tidak ditemukan', { show_alert: true });
    }

    const stock = await prisma.productCredential.count({
      where: { productId: product.id, isUsed: false }
    });

    const statusIcon = stock > 0 ? '🟢' : '🔴';
    const statusText = stock > 0 ? 'Tersedia' : 'Stok Habis';

    await ctx.answerCbQuery();
    await ctx.reply(
      `🛍️ <b>${escapeHtml(product.name)}</b>\n\n` +
      `📝 ${escapeHtml(product.description || 'Produk digital berkualitas')}\n\n` +
      `💰 <b>Harga:</b> ${formatIDR(product.priceIDR)}\n` +
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
      const order = await prisma.order.findUnique({
        where: { orderId },
        include: { product: true }
      });

      if (!order) {
        return ctx.answerCbQuery('❌ Pesanan tidak ditemukan', { show_alert: true });
      }

      const { qrString } = await createQris({
        orderId: order.orderId,
        amount: order.priceIDR
      });

      const qrBuffer = await QRCode.toBuffer(qrString, { width: 400, margin: 1 });
      
      await ctx.answerCbQuery();
      await ctx.replyWithPhoto({ source: qrBuffer }, {
        caption:
          `📱 <b>Scan QRIS untuk bayar</b>\n\n` +
          `🛍️ ${escapeHtml(order.product.name)}\n` +
          `💰 ${formatIDR(order.priceIDR)}\n\n` +
          `⏰ QR berlaku 15 menit\n` +
          `✨ Produk dikirim otomatis setelah bayar`,
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('QRIS Error:', error);
      await ctx.answerCbQuery('❌ Gagal membuat QRIS', { show_alert: true });
    }
    return;
  }

  // Admin stats
  if (data === 'ADMIN_STATS' && isAdminCtx(ctx)) {
    const [totalProducts, totalOrders, fulfilledOrders] = await Promise.all([
      prisma.product.count(),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'FULFILLED' } }),
    ]);

    await ctx.answerCbQuery();
    await ctx.reply(
      `📊 <b>STATISTIK TOKO</b>\n\n` +
      `📦 Total Produk: ${totalProducts}\n` +
      `📋 Total Pesanan: ${totalOrders}\n` +
      `✅ Pesanan Selesai: ${fulfilledOrders}\n\n` +
      `🌐 <b>Dashboard Web:</b> ${PUBLIC_BASE_URL}/admin`,
      { parse_mode: 'HTML' }
    );
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

  const order = await prisma.order.findUnique({
    where: { orderId },
    include: { user: true, product: true }
  });
  
  if (!order) return res.status(404).json({ ok: false });

  const paid = (provider === 'tripay') ? Tripay.isPaid(status) : Midtrans.isPaid(status);

  if (paid && order.status !== ORDER_STATUS.FULFILLED) {
    // Update order status to PAID
    if (order.status !== ORDER_STATUS.PAID) {
      await prisma.order.update({ 
        where: { id: order.id }, 
        data: { status: ORDER_STATUS.PAID } 
      });
    }

    // Find available credential
    const credential = await prisma.productCredential.findFirst({
      where: { productId: order.productId, isUsed: false },
      orderBy: { id: 'asc' }
    });

    if (!credential) {
      await notifyUser(order.user.telegramId,
        `✅ Pembayaran <b>${escapeHtml(order.product.name)}</b> berhasil!\n\n` +
        `❌ Namun stok sedang kosong. Admin akan segera menindaklanjuti.`,
        true
      );
      return res.json({ ok: true, note: 'Paid, no stock' });
    }

    // Mark credential as used
    await prisma.productCredential.update({
      where: { id: credential.id },
      data: { isUsed: true, usedAt: new Date() }
    });

    // Update order to fulfilled
    await prisma.order.update({
      where: { id: order.id },
      data: { status: ORDER_STATUS.FULFILLED, deliveredPayload: credential.payload }
    });

    // Send product to user
    const message =
      `🎉 <b>Pembayaran Berhasil!</b>\n\n` +
      `🛍️ <b>Produk:</b> ${escapeHtml(order.product.name)}\n` +
      `💰 <b>Total:</b> ${formatIDR(order.priceIDR)}\n\n` +
      `🎁 <b>Data Produk Anda:</b>\n` +
      `<pre><code>${escapeHtml(credential.payload)}</code></pre>\n\n` +
      `✨ Terima kasih telah berbelanja! Semoga bermanfaat.`;
      
    await notifyUser(order.user.telegramId, message, true);
    return res.json({ ok: true });
  }

  // Handle failed payments
  const failSet = new Set(['FAILED', 'EXPIRED', 'REFUND', 'CANCEL', 'DENY', 'EXPIRE', 'FAILURE']);
  if (failSet.has(String(status).toUpperCase())) {
    await prisma.order.update({ 
      where: { id: order.id }, 
      data: { status: ORDER_STATUS.FAILED } 
    });
    await notifyUser(
      order.user.telegramId,
      `❌ Transaksi <b>${escapeHtml(order.product.name)}</b> ${String(status).toUpperCase()}.`,
      true
    );
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
});

// Launch Telegram bot
bot.launch().then(() => {
  console.log('✅ Telegram bot berhasil dijalankan!');
  console.log(`🏪 Toko digital siap melayani pelanggan`);
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
