import db from './database.js';
import { processSuccessfulPayment } from './delivery.js';
import paymentGateway from './paymentGateway.js';

// Service untuk check status pembayaran manual
export class PaymentCheckService {

  async manualPaymentCheck(orderId) {
    try {
      console.log('💳 Manual payment check for order:', orderId);
      
      // Get order from database first
      const order = await db.getOrderByOrderId(orderId);
      if (!order) {
        throw new Error('Pesanan tidak ditemukan di database');
      }

      // Skip if already fulfilled
      if (order.status === 'FULFILLED') {
        return {
          success: true,
          status: 'FULFILLED',
          message: 'Pesanan sudah selesai dan produk sudah dikirim',
          order
        };
      }

      // STEP 1: Check payment status directly from gateway
      console.log('🔍 Querying payment gateway for real-time status...');
      const gatewayResult = await paymentGateway.getPaymentStatus(orderId);
      
      console.log('🔎 Gateway response:', gatewayResult);

      if (!gatewayResult.found) {
        return {
          success: false,
          status: 'NOT_FOUND',
          message: gatewayResult.message || 'Transaksi tidak ditemukan di payment gateway',
          order
        };
      }

      // STEP 2: Process based on gateway status
      const provider = process.env.PAYMENT_PROVIDER || 'midtrans';
      
      // Check if payment is successful
      if (paymentGateway.isPaymentSuccessful(gatewayResult, provider)) {
        console.log('✅ Payment confirmed successful! Processing fulfillment...');
        
        // Update order to PAID first if not already
        if (order.status !== 'PAID') {
          await db.updateOrderByOrderId(orderId, { status: 'PAID' });
        }

        // Get available credential
        const credential = await db.getUnusedCredential(order.product_id);
        
        if (!credential) {
          await db.updateOrderByOrderId(orderId, { status: 'PAID' });
          return {
            success: true,
            status: 'PAID',
            message: 'Pembayaran berhasil dikonfirmasi! Namun stok kosong, admin akan segera menindaklanjuti.',
            order: { ...order, status: 'PAID' },
            gatewayInfo: gatewayResult
          };
        }

        // Mark credential as used and fulfill order
        await db.useCredential(credential.id);
        await db.updateOrderByOrderId(orderId, {
          status: 'FULFILLED',
          delivered_payload: credential.payload
        });

        return {
          success: true,
          status: 'FULFILLED',
          message: 'Pembayaran berhasil dikonfirmasi! Produk sudah dikirim.',
          order: { ...order, status: 'FULFILLED' },
          credential: credential.payload,
          gatewayInfo: gatewayResult
        };
      }

      // Check if payment failed
      if (paymentGateway.isPaymentFailed(gatewayResult, provider)) {
        console.log(`❌ Payment failed for order ${orderId}, deleting from database...`);
        
        // Delete failed order from database
        await db.deleteOrder(orderId);
        
        return {
          success: false,
          status: 'DELETED',
          message: `Pembayaran gagal (${gatewayResult.status}). Pesanan telah dihapus dari sistem.`,
          order: null,
          gatewayInfo: gatewayResult
        };
      }

      // Payment still pending
      const statusMessage = paymentGateway.getStatusMessage(gatewayResult, provider);
      
      return {
        success: true,
        status: 'PENDING',
        message: statusMessage,
        order,
        gatewayInfo: gatewayResult
      };

    } catch (error) {
      console.error('Manual payment check error:', error);
      throw error;
    }
  }
}

export default new PaymentCheckService();
