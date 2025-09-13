import db from './database.js';
import { escapeHtml, formatIDR } from '../utils/formatter.js';

export async function processSuccessfulPayment(order, bot, telegramId = null) {
  try {
    console.log('Processing successful payment for order:', order.order_id);
    
    // Update order to PAID if not already
    if (order.status !== 'PAID') {
      await db.updateOrderByOrderId(order.order_id, { status: 'PAID' });
    }

    // Get available credential
    const credential = await db.getUnusedCredential(order.product_id);
    
    if (!credential) {
      const message = 
        `✅ <b>Pembayaran Berhasil!</b>\n\n` +
        `🛍️ <b>Produk:</b> ${escapeHtml(order.products?.name || 'Unknown')}\n` +
        `💰 <b>Total:</b> ${formatIDR(order.price_idr)}\n\n` +
        `❌ <b>Stok Kosong:</b>\n` +
        `Maaf, stok produk sedang habis.\n` +
        `Admin akan segera menindaklanjuti pesanan Anda.\n\n` +
        `🆔 <b>Order ID:</b> <code>${order.order_id}</code>\n` +
        `📞 Hubungi admin jika ada pertanyaan.`;
      
      const userId = telegramId || order.users?.telegram_id;
      if (userId && bot) {
        await bot.telegram.sendMessage(userId, message, { parse_mode: 'HTML' });
      }
      
      return {
        success: true,
        status: 'PAID',
        message: 'Pembayaran berhasil, namun stok habis'
      };
    }

    // Mark credential as used
    await db.useCredential(credential.id);

    // Update order to fulfilled
    await db.updateOrderByOrderId(order.order_id, {
      status: 'FULFILLED',
      delivered_payload: credential.payload
    });

    // Send product to user
    const message =
      `🎉 <b>Pembayaran Berhasil!</b>\n\n` +
      `🛍️ <b>Produk:</b> ${escapeHtml(order.products?.name || 'Unknown')}\n` +
      `💰 <b>Total:</b> ${formatIDR(order.price_idr)}\n\n` +
      `🎁 <b>Data Produk Anda:</b>\n` +
      `<pre><code>${escapeHtml(credential.payload)}</code></pre>\n\n` +
      `✨ <b>Terima kasih telah berbelanja!</b>\n` +
      `Semoga produk digital ini bermanfaat untuk Anda.\n\n` +
      `💡 <b>Tips:</b>\n` +
      `• Simpan data ini dengan aman\n` +
      `• Jangan bagikan ke orang lain\n` +
      `• Hubungi admin jika ada masalah`;
      
    const userId = telegramId || order.users?.telegram_id;
    if (userId && bot) {
      await bot.telegram.sendMessage(userId, message, { parse_mode: 'HTML' });
    }
    
    console.log('Product delivered successfully to user:', userId);
    
    return {
      success: true,
      status: 'FULFILLED',
      message: 'Pembayaran berhasil dan produk sudah dikirim',
      credential: credential.payload
    };

  } catch (error) {
    console.error('Process successful payment error:', error);
    throw error;
  }
}

export async function checkAndProcessPendingPayments(bot) {
  try {
    console.log('Checking pending payments...');
    
    // Get all pending orders from last 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    
    const pendingOrders = await db.getOrders({
      status: 'PENDING',
      limit: 50
    });

    console.log(`Found ${pendingOrders.length} pending orders`);

    for (const order of pendingOrders) {
      try {
        const result = await paymentCheck.manualPaymentCheck(order.order_id);
        
        if (result.status === 'FULFILLED' && result.credential) {
          console.log(`Auto-delivered product for order: ${order.order_id}`);
        }
      } catch (error) {
        console.error(`Failed to check order ${order.order_id}:`, error.message);
      }
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
  } catch (error) {
    console.error('Check pending payments error:', error);
  }
}
