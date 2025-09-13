import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import { Telegraf, Markup } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { log, error } from '../logger.js';
import { generateOrderId, formatIDR, escapeHtml } from '../utils/formatter.js';
import QRCode from 'qrcode';
import {
  createPayLink,
  createQris,
  tripay as Tripay,
  midtrans as Midtrans
} from '../payment/index.js';

// Import handlers
import { handleStart } from './handlers/start.js';
import { renderProductList, renderPopularProducts } from './handlers/products.js';

// Initialize
const prisma = new PrismaClient();
const { TELEGRAM_BOT_TOKEN, PUBLIC_BASE_URL } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN tidak ditemukan di .env');
  process.exit(1);
}

if (!PUBLIC_BASE_URL) {
  console.error('❌ PUBLIC_BASE_URL tidak ditemukan di .env');
  process.exit(1);
}

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

// Keyboard utama - sudah diperbarui untuk Indonesia
function mainKeyboard() {
  const top = [
    ['📦 Daftar Produk', '📋 Riwayat Transaksi'],
    ['✨ Produk Populer', '❓ Cara Pemesanan'],
    ['📞 Hubungi Admin']
  ];
  return Markup.keyboard(top).resize().persistent();
}

// Throttle helper (anti spam callback)
const cbqRate = new Map();
function shouldThrottle(id, ms = 2000) {
  const now = Date.now();
  const last = cbqRate.get(id) || 0;
  if (now - last < ms) return true;
  cbqRate.set(id, now);
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [id, t] of cbqRate) if (t < cutoff) cbqRate.delete(id);
}, 60_000);

// Mini session untuk wizard admin
const adminSessions = new Map();
function getSess(ctx) {
  const id = String(ctx.from?.id || '');
  if (!adminSessions.has(id)) adminSessions.set(id, { step: null, data: {} });
  return adminSessions.get(id);
}

function clearSess(ctx) {
  const id = String(ctx.from?.id || '');
  adminSessions.delete(id);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const app = express();

// Setup Express for webhooks
app.set('trust proxy', true);
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf?.toString('utf8') || ''; }
}));
app.use(morgan('dev'));

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

// Admin commands
bot.command('admin', requireAdmin(async (ctx) => {
  await ctx.reply(
    '👑 <b>Panel Admin</b>\n\nPilih aksi yang ingin dilakukan:',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Tambah Produk', callback_data: 'ADMIN_ADD_PRODUCT' }],
          [{ text: '📦 Kelola Produk', callback_data: 'ADMIN_LIST_PRODUCTS' }],
          [{ text: '📊 Statistik Toko', callback_data: 'ADMIN_STATS' }],
          [{ text: '🌐 Dashboard Web', url: `${PUBLIC_BASE_URL}/admin` }]
        ]
      }
    }
  );
}));

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

// Handle product info and purchase
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

  // Check for recent pending order
  const recentOrder = await prisma.order.findFirst({
    where: {
      user: { telegramId: String(ctx.from.id) },
      productId: product.id,
      status: ORDER_STATUS.PENDING,
      createdAt: { gte: new Date(Date.now() - 30 * 1000) }
    },
    orderBy: { id: 'desc' }
  });

  if (recentOrder) {
    await ctx.reply(
      `🧾 <b>Pesanan ${escapeHtml(product.name)}</b>\n\n` +
      `💰 Total: ${formatIDR(recentOrder.priceIDR)}\n\n` +
      `⚡ Pilih metode pembayaran:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Bayar Via Link', callback_data: `PAY_LINK_${recentOrder.orderId}` }],
            [{ text: '🟦 QRIS (Tampilkan QR)', callback_data: `PAY_QRIS_${recentOrder.orderId}` }]
          ]
        }
      }
    );
    return;
  }

  // Create new order
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
          [{ text: '💳 Bayar Via Link', callback_data: `PAY_LINK_${order.orderId}` }],
          [{ text: '🟦 QRIS (Tampilkan QR)', callback_data: `PAY_QRIS_${order.orderId}` }]
        ]
      }
    }
  );
}

// Callback query handlers
bot.on('callback_query', async (ctx) => {
  const uid = String(ctx.from?.id || '');
  if (shouldThrottle(uid, 2000)) {
    return ctx.answerCbQuery('⏳ Tunggu sebentar...', { show_alert: false });
  }
  
  const data = ctx.callbackQuery?.data || '';
  console.log('[callback]', data, 'from', ctx.from?.id);

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

  // Handle payment methods
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
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Cek Status Bayar', callback_data: `CHK_${order.orderId}` }]
          ]
        }
      });
    } catch (error) {
      console.error('QRIS Error:', error);
      await ctx.answerCbQuery('❌ Gagal membuat QRIS', { show_alert: true });
    }
    return;
  }

  // Handle payment status check
  if (data.startsWith('CHK_')) {
    await ctx.answerCbQuery('⏳ Menunggu konfirmasi pembayaran...', { show_alert: true });
    return;
  }

  // Handle admin callbacks
  if (data.startsWith('ADMIN_') && !isAdminCtx(ctx)) {
    return ctx.answerCbQuery('❌ Akses admin saja', { show_alert: true });
  }

  if (data === 'ADMIN_STATS') {
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

// Set bot commands
bot.telegram.setMyCommands([
  { command: 'start', description: '🏠 Mulai menggunakan bot' },
  { command: 'products', description: '📦 Lihat daftar produk' },
  { command: 'popular', description: '✨ Produk terlaris' },
  { command: 'help', description: '❓ Bantuan penggunaan' },
  { command: 'admin', description: '👑 Panel admin (khusus admin)' }
]);

// Webhook handlers for payments
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

async function notifyUser(telegramId, message, html = false) {
  try {
    await bot.telegram.sendMessage(telegramId, message, html ? { parse_mode: 'HTML' } : undefined);
  } catch (e) {
    console.error('Notify user error:', e.message);
  }
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

// Launch bot and server
const BOT_PORT = process.env.BOT_PORT || 3001;

// Start Express server for webhooks
app.listen(BOT_PORT, () => {
  console.log(`🤖 Bot webhook server running on port ${BOT_PORT}`);
  console.log(`📡 Webhook URL: ${PUBLIC_BASE_URL}/payment/webhook`);
});

// Launch Telegram bot
bot.launch().then(() => {
  console.log('✅ Telegram bot berhasil dijalankan!');
  console.log(`🏪 Toko digital siap melayani pelanggan`);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

export default { bot, app };
