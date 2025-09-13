import db from '../../services/database.js';
import { escapeHtml, truncateText, shortIDR } from '../../utils/formatter.js';

const PAGE_SIZE = 6;

export async function renderProductList(ctx, page = 1, messageId = null) {
  try {
    page = Math.max(1, Number(page) || 1);

    // Get products from Supabase
    const total = await db.countRecords('products', { is_active: true });
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pages) page = pages;

    const offset = (page - 1) * PAGE_SIZE;
    const products = await db.getProducts({
      isActive: true,
      limit: PAGE_SIZE,
      offset: offset,
      orderBy: { column: 'id', ascending: true }
    });

    const lines = [
      `📦 <b>DAFTAR PRODUK</b>`,
      `Halaman ${page} dari ${pages}`,
      '',
      'Pilih produk yang Anda inginkan:'
    ];

    // Get stock information for all products
    const productIds = products.map(p => p.id);
    const stockMap = await db.getProductsWithStock(productIds);

    const keyboard = [];

    // Create product buttons
    for (const product of products) {
      const stock = stockMap[product.id] ?? 0;
      const statusIcon = stock > 0 ? '🟢' : '🔴';
      const label = `${truncateText(product.name)} • ${shortIDR(product.price_idr)} ${statusIcon}`;
      keyboard.push([{ text: label, callback_data: `INFO_${product.slug}_p${page}` }]);
    }

    // Navigation buttons
    const nav = [];
    if (page > 1) nav.push({ text: '◀️ Sebelumnya', callback_data: `CATALOG_${page - 1}` });
    nav.push({ text: `📄 ${page}/${pages}`, callback_data: 'NOOP' });
    if (page < pages) nav.push({ text: 'Selanjutnya ▶️', callback_data: `CATALOG_${page + 1}` });
    keyboard.push(nav);

    const text = lines.join('\n');
    const options = { 
      parse_mode: 'HTML', 
      reply_markup: { inline_keyboard: keyboard } 
    };

    if (messageId) {
      try { 
        return await ctx.editMessageText(text, options); 
      } catch { 
        return await ctx.reply(text, options); 
      }
    }
    return ctx.reply(text, options);
  } catch (error) {
    console.error('Product list error:', error);
    await ctx.reply(
      '❌ Maaf, terjadi kesalahan saat memuat produk.\n\n' +
      'Silakan coba lagi atau hubungi admin.',
      { reply_markup: mainKeyboard().reply_markup }
    );
  }
}

export async function renderPopularProducts(ctx, messageId = null) {
  try {
    const products = await db.getProducts({
      isActive: true,
      limit: 5,
      orderBy: { column: 'id', ascending: false }
    });

    if (!products.length) {
      const message = '🔥 PRODUK TERLARIS\n\nBelum ada produk tersedia.';
      const options = { parse_mode: 'HTML' };
      if (messageId) {
        try { 
          return await ctx.editMessageText(message, options); 
        } catch { 
          return await ctx.reply(message, options); 
        }
      }
      return ctx.reply(message, options);
    }

    // Get stock information for all products
    const productIds = products.map(p => p.id);
    const stockMap = await db.getProductsWithStock(productIds);

    const lines = ['🔥 <b>PRODUK TERLARIS</b>', '', 'Pilih salah satu:'];
    const keyboard = [];

    for (const product of products) {
      const stock = stockMap[product.id] ?? 0;
      const statusIcon = stock > 0 ? '🟢' : '🔴';
      const buttonText = `${product.name} • ${shortIDR(product.price_idr)} ${statusIcon}`;
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

    if (messageId) {
      try { 
        return await ctx.editMessageText(text, options); 
      } catch { 
        return await ctx.reply(text, options); 
      }
    }
    return ctx.reply(text, options);
  } catch (error) {
    console.error('Popular products error:', error);
    await ctx.reply(
      '❌ Maaf, terjadi kesalahan saat memuat produk populer.\n\n' +
      'Silakan coba lagi atau hubungi admin.'
    );
  }
}
