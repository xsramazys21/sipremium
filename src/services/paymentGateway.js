import axios from 'axios';

// Service untuk cek status pembayaran langsung ke payment gateway
export class PaymentGatewayService {
  
  async checkTripayStatus(orderId) {
    try {
      console.log('🔍 Checking Tripay status for order:', orderId);
      
      const response = await axios.get(`${process.env.TRIPAY_BASE_URL}/merchant/transactions`, {
        headers: {
          'Authorization': `Bearer ${process.env.TRIPAY_API_KEY_PRIVATE}`,
          'Content-Type': 'application/json'
        }
      });
      
      const result = response.data;
      
      if (!result.success) {
        throw new Error('Tripay API error: ' + result.message);
      }

      // Find order by reference
      const transaction = result.data?.find(tx => tx.reference === orderId);
      
      if (!transaction) {
        return {
          found: false,
          status: 'NOT_FOUND',
          message: 'Transaksi tidak ditemukan di Tripay'
        };
      }

      return {
        found: true,
        status: transaction.status,
        reference: transaction.reference,
        amount: transaction.amount,
        method: transaction.payment_method,
        paid_at: transaction.paid_at,
        raw: transaction
      };
      
    } catch (error) {
      console.error('Tripay status check error:', error);
      return {
        found: false,
        status: 'ERROR',
        message: 'Gagal mengecek status di Tripay: ' + error.message
      };
    }
  }

  async checkMidtransStatus(orderId) {
    try {
      console.log('🔍 Checking Midtrans status for order:', orderId);
      
      const auth = Buffer.from(process.env.MIDTRANS_SERVER_KEY + ':').toString('base64');
      const baseUrl = process.env.MIDTRANS_IS_PRODUCTION === 'true' ? 
        'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
      
      const response = await axios.get(`${baseUrl}/v2/${orderId}/status`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        validateStatus: (status) => status < 500 // Accept 404 as valid response
      });
      
      if (response.status === 404) {
        return {
          found: false,
          status: 'NOT_FOUND',
          message: 'Transaksi tidak ditemukan di Midtrans'
        };
      }
      
      const data = response.data;
      
      if (response.status !== 200) {
        throw new Error('Midtrans API error: ' + data.status_message);
      }

      return {
        found: true,
        status: data.transaction_status,
        reference: data.transaction_id,
        amount: data.gross_amount,
        method: data.payment_type,
        fraud_status: data.fraud_status,
        settlement_time: data.settlement_time,
        raw: data
      };
      
    } catch (error) {
      console.error('Midtrans status check error:', error);
      return {
        found: false,
        status: 'ERROR',
        message: 'Gagal mengecek status di Midtrans: ' + error.message
      };
    }
  }

  async getPaymentStatus(orderId) {
    const provider = process.env.PAYMENT_PROVIDER || 'midtrans';
    
    console.log(`🔍 Checking payment status with ${provider} for order: ${orderId}`);
    
    if (provider === 'tripay') {
      return await this.checkTripayStatus(orderId);
    } else {
      return await this.checkMidtransStatus(orderId);
    }
  }

  // Determine if payment is successful based on provider
  isPaymentSuccessful(gatewayResult, provider = null) {
    if (!gatewayResult.found) return false;
    
    const currentProvider = provider || process.env.PAYMENT_PROVIDER || 'midtrans';
    const status = gatewayResult.status;

    if (currentProvider === 'tripay') {
      return ['PAID'].includes(status?.toUpperCase());
    } else {
      // Midtrans
      return ['capture', 'settlement'].includes(status?.toLowerCase()) && 
             (!gatewayResult.fraud_status || gatewayResult.fraud_status === 'accept');
    }
  }

  // Determine if payment is failed/expired
  isPaymentFailed(gatewayResult, provider = null) {
    if (!gatewayResult.found) return false;
    
    const currentProvider = provider || process.env.PAYMENT_PROVIDER || 'midtrans';
    const status = gatewayResult.status;

    if (currentProvider === 'tripay') {
      return ['FAILED', 'EXPIRED', 'REFUND'].includes(status?.toUpperCase());
    } else {
      // Midtrans
      return ['deny', 'cancel', 'expire', 'failure'].includes(status?.toLowerCase()) ||
             gatewayResult.fraud_status === 'deny';
    }
  }

  // Get user-friendly status message
  getStatusMessage(gatewayResult, provider = null) {
    if (!gatewayResult.found) {
      return 'Transaksi tidak ditemukan di payment gateway';
    }

    const currentProvider = provider || process.env.PAYMENT_PROVIDER || 'midtrans';
    const status = gatewayResult.status;

    if (this.isPaymentSuccessful(gatewayResult, currentProvider)) {
      return 'Pembayaran berhasil! ✅';
    }

    if (this.isPaymentFailed(gatewayResult, currentProvider)) {
      return 'Pembayaran gagal atau dibatalkan ❌';
    }

    // Pending states
    if (currentProvider === 'tripay') {
      return status === 'UNPAID' ? 'Menunggu pembayaran ⏳' : `Status: ${status}`;
    } else {
      return status === 'pending' ? 'Menunggu pembayaran ⏳' : `Status: ${status}`;
    }
  }
}

export default new PaymentGatewayService();
