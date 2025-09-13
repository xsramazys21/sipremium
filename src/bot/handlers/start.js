import db from '../../services/database.js';
import { escapeHtml } from '../../utils/formatter.js';
import { Markup } from 'telegraf';

// Keyboard utama
function mainKeyboard() {
  const top = [
    ['📦 Daftar Produk', '📋 Riwayat Transaksi'],
    ['✨ Produk Populer', '❓ Cara Pemesanan'],
    ['📞 Hubungi Admin']
  ];
  return Markup.keyboard(top).resize().persistent();
}

export async function handleStart(ctx) {
  try {
    const telegramId = String(ctx.from.id);
    
    // Upsert user data using Supabase
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
  } catch (error) {
    console.error('Start handler error:', error);
    await ctx.reply(
      'Selamat datang! 👋\n\n' +
      '🛍️ <b>Toko Digital Indonesia</b>\n' +
      'Tempat terbaik untuk produk digital berkualitas\n\n' +
      'Gunakan menu di bawah untuk mulai berbelanja!',
      { 
        parse_mode: 'HTML',
        reply_markup: mainKeyboard().reply_markup
      }
    );
  }
}
