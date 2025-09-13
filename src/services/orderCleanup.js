import db from './database.js';
import paymentGateway from './paymentGateway.js';
import { processSuccessfulPayment } from './delivery.js';

export class OrderCleanupService {
  
  async cleanupOrdersBasedOnGatewayStatus(bot = null) {
    try {
      console.log('🔍 Starting gateway-based order cleanup...');
      
      // STEP 1: Get all PENDING orders from database
      const pendingOrders = await db.getOrders({ 
        status: 'PENDING', 
        includeAll: true, 
        limit: 100 
      });
      
      console.log(`📋 Found ${pendingOrders.length} pending orders to check`);
      
      if (pendingOrders.length === 0) {
        console.log('✅ No pending orders to process');
        return { processed: 0, deleted: 0, fulfilled: 0 };
      }

      let deletedCount = 0;
      let fulfilledCount = 0;
      let processedCount = 0;

      // STEP 2: Check each order against payment gateway
      for (const order of pendingOrders) {
        try {
          processedCount++;
          console.log(`\n🔍 [${processedCount}/${pendingOrders.length}] Checking order: ${order.order_id}`);
          
          // Query payment gateway for real status
          const gatewayResult = await paymentGateway.getPaymentStatus(order.order_id);
          
          console.log(`   Gateway status: ${gatewayResult.status} (found: ${gatewayResult.found})`);
          
          if (!gatewayResult.found) {
            console.log(`   ❌ Order not found in gateway, deleting from database...`);
            await db.deleteOrder(order.order_id);
            deletedCount++;
            
            // Notify user if bot available
            if (bot && order.users?.telegram_id) {
              await this.notifyOrderDeleted(bot, order, 'Order tidak ditemukan di payment gateway');
            }
            continue;
          }

          // Check if payment is successful
          if (paymentGateway.isPaymentSuccessful(gatewayResult)) {
            console.log(`   ✅ Payment successful, processing fulfillment...`);
            
            try {
              // Process fulfillment
              const result = await processSuccessfulPayment(order, bot, order.users?.telegram_id);
              if (result.success) {
                fulfilledCount++;
                console.log(`   ✅ Product delivered successfully`);
              }
            } catch (fulfillmentError) {
              console.error(`   ❌ Fulfillment error:`, fulfillmentError.message);
            }
            continue;
          }

          // Check if payment failed/expired
          if (paymentGateway.isPaymentFailed(gatewayResult)) {
            console.log(`   ❌ Payment failed/expired, deleting from database...`);
            await db.deleteOrder(order.order_id);
            deletedCount++;
            
            // Notify user if bot available
            if (bot && order.users?.telegram_id) {
              await this.notifyOrderDeleted(bot, order, `Pembayaran ${gatewayResult.status}`);
            }
            continue;
          }

          // Payment still pending - keep in database
          console.log(`   ⏳ Payment still pending, keeping in database`);
          
        } catch (orderError) {
          console.error(`   ❌ Error processing order ${order.order_id}:`, orderError.message);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const summary = {
        processed: processedCount,
        deleted: deletedCount,
        fulfilled: fulfilledCount,
        kept: processedCount - deletedCount - fulfilledCount
      };

      console.log('\n📊 Cleanup Summary:');
      console.log(`   🔍 Processed: ${summary.processed} orders`);
      console.log(`   ✅ Fulfilled: ${summary.fulfilled} orders`);
      console.log(`   🗑️ Deleted: ${summary.deleted} orders`);
      console.log(`   ⏳ Kept pending: ${summary.kept} orders`);
      
      return summary;

    } catch (error) {
      console.error('Cleanup service error:', error);
      throw error;
    }
  }

  async notifyOrderDeleted(bot, order, reason) {
    try {
      const message = 
        `🗑️ <b>Pesanan Dihapus</b>\n\n` +
        `🛍️ <b>Produk:</b> ${order.products?.name || 'Unknown'}\n` +
        `🆔 <b>Order ID:</b> <code>${order.order_id}</code>\n` +
        `💰 <b>Total:</b> Rp ${order.price_idr.toLocaleString('id-ID')}\n\n` +
        `❌ <b>Alasan:</b> ${reason}\n\n` +
        `💡 <b>Anda dapat memesan ulang produk yang sama jika masih membutuhkan.</b>\n\n` +
        `📞 <b>Kontak Admin:</b>\n` +
        `• Telegram: ${process.env.ADMIN_CONTACT || '@admin'}\n` +
        `• WhatsApp: ${process.env.ADMIN_WHATSAPP || '+62xxx-xxxx-xxxx'}`;

      await bot.telegram.sendMessage(order.users.telegram_id, message, { 
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛒 Pesan Ulang', url: `t.me/${bot.botInfo.username}` }],
            [{ text: '📞 Hubungi Admin', url: `t.me/${(process.env.ADMIN_CONTACT || '@admin').replace('@', '')}` }]
          ]
        }
      });
      
      console.log(`   📤 Notified user ${order.users.telegram_id} about deleted order`);
    } catch (error) {
      console.error('   ❌ Failed to notify user:', error.message);
    }
  }

  // Enhanced cleanup untuk orders lama berdasarkan created_at DAN gateway status
  async cleanupOldOrders(hoursOld = 2, bot = null) {
    try {
      console.log(`🕐 Cleaning up orders older than ${hoursOld} hours...`);
      
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hoursOld);
      
      // Get orders yang masih PENDING tapi dibuat lebih dari X jam lalu
      const { data: oldOrders, error } = await db.client
        .from('orders')
        .select(`
          *,
          users(telegram_id, first_name),
          products(name)
        `)
        .eq('status', 'PENDING')
        .lt('created_at', cutoffTime.toISOString())
        .limit(50);
      
      if (error) throw error;
      
      console.log(`📋 Found ${oldOrders.length} old pending orders to verify`);
      
      let deletedCount = 0;
      
      for (const order of oldOrders) {
        try {
          console.log(`🔍 Checking old order: ${order.order_id}`);
          
          // Check real status in gateway
          const gatewayResult = await paymentGateway.getPaymentStatus(order.order_id);
          
          // If not found in gateway OR explicitly failed/expired
          if (!gatewayResult.found || paymentGateway.isPaymentFailed(gatewayResult)) {
            console.log(`   🗑️ Deleting old order: ${gatewayResult.status || 'NOT_FOUND'}`);
            await db.deleteOrder(order.order_id);
            deletedCount++;
            
            // Notify user
            if (bot && order.users?.telegram_id) {
              await this.notifyOrderDeleted(bot, order, `Expired (${hoursOld}h timeout)`);
            }
          } else if (paymentGateway.isPaymentSuccessful(gatewayResult)) {
            console.log(`   ✅ Old order was actually paid, processing...`);
            await processSuccessfulPayment(order, bot, order.users?.telegram_id);
          } else {
            console.log(`   ⏳ Old order still valid pending`);
          }
          
        } catch (orderError) {
          console.error(`   ❌ Error checking old order ${order.order_id}:`, orderError.message);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      console.log(`✅ Processed ${oldOrders.length} old orders, deleted ${deletedCount}`);
      return deletedCount;
      
    } catch (error) {
      console.error('Cleanup old orders error:', error);
      return 0;
    }
  }
}

export default new OrderCleanupService();
