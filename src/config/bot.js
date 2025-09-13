import { Telegraf, Markup } from 'telegraf';

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

export function isAdminCtx(ctx) {
  const id = ctx?.from?.id ? String(ctx.from.id) : '';
  return ADMIN_IDS.includes(id);
}

export function requireAdmin(handler) {
  return async (ctx, ...args) => {
    if (!isAdminCtx(ctx)) {
      return ctx.reply('⛔ Akses ditolak. Fitur ini khusus untuk admin.');
    }
    return handler(ctx, ...args);
  };
}

// Keyboard utama - diperbarui untuk Indonesia
export function mainKeyboard() {
  const top = [
    ['📦 Daftar Produk', '📋 Riwayat Transaksi'],
    ['✨ Produk Populer', '❓ Cara Pemesanan'],
    ['📞 Hubungi Admin']
  ];
  return Markup.keyboard(top).resize().persistent();
}

// Status pesanan
export const ORDER_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FULFILLED: 'FULFILLED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED'
};

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

export default bot;
