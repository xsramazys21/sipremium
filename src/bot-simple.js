import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { escapeHtml, formatIDR } from './utils/formatter.js';

const { TELEGRAM_BOT_TOKEN, PUBLIC_BASE_URL } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN tidak ditemukan di .env');
  process.exit(1);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Dummy data untuk testing (sampai database fix)
const dummyProducts = [
  {
    id: 1,
    name: 'Netflix Premium 1 Bulan',
    slug: 'netflix-premium-1-bulan',
    description: 'Akun Netflix Premium untuk 1 bulan, kualitas 4K',
    price_idr: 65000,
    is_active: true,
    stock: 5
  },
  {
    id: 2,
    name: 'Spotify Premium 3 Bulan',
    slug: 'spotify-premium-3-bulan',
    description: 'Akun Spotify Premium untuk 3 bulan, tanpa iklan',
    price_idr: 45000,
    is_active: true,
    stock: 3
  },
  {
    id: 3,
    name: 'Canva Pro 1 Tahun',
    slug: 'canva-pro-1-tahun',
    description: 'Akun Canva Pro untuk 1 tahun penuh',
    price_idr: 120000,
    is_active: true,
    stock: 2
  }
];

// Keyboard utama
function mainKeyboard() {
  const top = [
    ['📦 Daftar Produk', '📋 Riwayat Transaksi'],
    ['✨ Produk Populer', '❓ Cara Pemesanan'],
    ['📞 Hubungi Admin']
  ];
  return Markup.keyboard(top).resize().persistent();
}

// Start handler
bot.start(async (ctx) => {
  try {
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
  } catch (error) {
    console.error('Start error:', error);
    await ctx.reply('🛍️ Selamat datang di Toko Digital Indonesia!');
  }
});

// Product list handler
function renderProductList(ctx, page = 1) {
  try {
    const products = dummyProducts.filter(p => p.is_active);
    
    const lines = [
      `📦 <b>DAFTAR PRODUK</b>`,
      `Halaman 1 dari 1`,
      '',
      'Pilih produk yang Anda inginkan:'
    ];

    const keyboard = [];

    // Create product buttons
    for (const product of products) {
      const statusIcon = product.stock > 0 ? '🟢' : '🔴';
      const label = `${product.name} • ${formatIDR(product.price_idr)} ${statusIcon}`;
      keyboard.push([{ text: label, callback_data: `INFO_${product.slug}` }]);
    }

    const text = lines.join('\n');
    const options = { 
      parse_mode: 'HTML', 
      reply_markup: { inline_keyboard: keyboard } 
    };

    return ctx.reply(text, options);
  } catch (error) {
    console.error('Product list error:', error);
    ctx.reply('❌ Gagal memuat produk. Silakan coba lagi.');
  }
}

// Popular products handler
function renderPopularProducts(ctx) {
  try {
    const products = dummyProducts.slice(0, 3); // Top 3

    const lines = ['🔥 <b>PRODUK TERLARIS</b>', '', 'Pilih salah satu:'];
    const keyboard = [];

    for (const product of products) {
      const statusIcon = product.stock > 0 ? '🟢' : '🔴';
      const buttonText = `${product.name} • ${formatIDR(product.price_idr)} ${statusIcon}`;
      keyboard.push([{ 
        text: buttonText, 
        callback_data: `POPINFO_${product.slug}` 
      }]);
    }
    keyboard.push([{ text: '📦 Lihat Semua Produk', callback_data: 'CATALOG_1' }]);

    const text = lines.join('\n');
    const options = { 
      parse_mode: 'HTML', 
      reply_markup: { inline_keyboard: keyboard } 
    };

    return ctx.reply(text, options);
  } catch (error) {
    console.error('Popular products error:', error);
    ctx.reply('❌ Gagal memuat produk populer. Silakan coba lagi.');
  }
}

// Text message handlers
bot.hears('📦 Daftar Produk', (ctx) => renderProductList(ctx, 1));
bot.hears('📋 Riwayat Transaksi', (ctx) => 
  ctx.reply('📭 Belum ada riwayat transaksi.\n\nMulai berbelanja sekarang! 🛒')
);
bot.hears('✨ Produk Populer', (ctx) => renderPopularProducts(ctx));
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

// Callback handler
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery?.data || '';
  console.log('Callback data:', data);

  try {
    // Handle product info
    if (data.startsWith('INFO_') || data.startsWith('POPINFO_')) {
      const slug = data.replace(/^(INFO_|POPINFO_)/, '').replace(/_p\d+$/, '');
      console.log('Product slug:', slug);
      
      const product = dummyProducts.find(p => p.slug === slug);
      
      if (!product) {
        return ctx.answerCbQuery('❌ Produk tidak ditemukan', { show_alert: true });
      }

      const statusIcon = product.stock > 0 ? '🟢' : '🔴';
      const statusText = product.stock > 0 ? 'Tersedia' : 'Stok Habis';

      await ctx.answerCbQuery();
      await ctx.reply(
        `🛍️ <b>${escapeHtml(product.name)}</b>\n\n` +
        `📝 ${escapeHtml(product.description)}\n\n` +
        `💰 <b>Harga:</b> ${formatIDR(product.price_idr)}\n` +
        `📦 <b>Stok:</b> ${statusIcon} ${statusText} (${product.stock})\n\n` +
        `${product.stock > 0 ? '✨ Siap untuk pembelian!' : '⏳ Segera restok!'}`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              product.stock > 0 ? [{ text: '🛒 Beli Sekarang', callback_data: `BUY_${product.slug}` }] : [],
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
      const product = dummyProducts.find(p => p.slug === slug);
      
      if (!product) {
        return ctx.answerCbQuery('❌ Produk tidak ditemukan', { show_alert: true });
      }

      await ctx.answerCbQuery('🛒 Memproses pesanan...');
      await ctx.reply(
        `🧾 <b>Pesanan ${escapeHtml(product.name)}</b>\n\n` +
        `💰 Total: ${formatIDR(product.price_idr)}\n` +
        `🆔 Order ID: <code>ORD-DEMO-${Date.now()}</code>\n\n` +
        `⚡ <b>Demo Mode:</b>\n` +
        `Ini adalah mode demo. Database Supabase sedang setup.\n\n` +
        `📊 Akses Admin Dashboard: ${PUBLIC_BASE_URL}/admin`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Handle catalog navigation
    if (data.startsWith('CATALOG_')) {
      await ctx.answerCbQuery();
      return renderProductList(ctx, 1);
    }

    // Handle no-op
    if (data === 'NOOP') {
      await ctx.answerCbQuery();
      return;
    }

  } catch (error) {
    console.error('Callback error:', error);
    await ctx.answerCbQuery('❌ Terjadi kesalahan', { show_alert: true });
  }
});

// Commands
bot.command('help', (ctx) =>
  ctx.reply(
    '📖 <b>Panduan Menggunakan Bot:</b>\n\n' +
    '📦 <b>Daftar Produk</b> - Lihat semua produk tersedia\n' +
    '📋 <b>Riwayat Transaksi</b> - Cek pesanan Anda\n' +
    '✨ <b>Produk Populer</b> - Produk terlaris\n' +
    '❓ <b>Cara Pemesanan</b> - Panduan order\n' +
    '📞 <b>Hubungi Admin</b> - Butuh bantuan?\n\n' +
    '<i>Gunakan tombol menu di bawah untuk navigasi mudah! 👇</i>',
    { parse_mode: 'HTML' }
  )
);

// Set bot commands
bot.telegram.setMyCommands([
  { command: 'start', description: '🏠 Mulai menggunakan bot' },
  { command: 'help', description: '❓ Bantuan penggunaan' }
]).catch(console.error);

// Launch bot
bot.launch().then(() => {
  console.log('✅ Simple Telegram bot berhasil dijalankan!');
  console.log(`🏪 Bot siap melayani pelanggan (demo mode)`);
}).catch(error => {
  console.error('❌ Bot launch error:', error);
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('🔄 Shutting down bot...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🔄 Shutting down bot...');
  bot.stop('SIGTERM');
  process.exit(0);
});

export default bot;
