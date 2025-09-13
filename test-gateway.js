import 'dotenv/config';
import paymentGateway from './src/services/paymentGateway.js';

console.log('🔍 Testing Payment Gateway Integration...\n');

async function testGateway() {
  try {
    const provider = process.env.PAYMENT_PROVIDER || 'midtrans';
    console.log(`Using payment provider: ${provider}\n`);

    // Test 1: Check existing order ID
    console.log('1️⃣ Testing real order status check...');
    
    // Use a real order ID from your database
    const testOrderId = 'ORD-MEMQ2P40-E1SH4'; // Ganti dengan order ID yang ada
    
    console.log(`Checking order: ${testOrderId}`);
    const result = await paymentGateway.getPaymentStatus(testOrderId);
    
    console.log('Gateway Response:');
    console.log(`   Found: ${result.found}`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Message: ${result.message || 'N/A'}`);
    
    if (result.found) {
      console.log(`   Reference: ${result.reference || 'N/A'}`);
      console.log(`   Amount: ${result.amount || 'N/A'}`);
      console.log(`   Method: ${result.method || 'N/A'}`);
      
      // Test payment status evaluation
      console.log('\n📊 Payment Status Evaluation:');
      console.log(`   Is Successful: ${paymentGateway.isPaymentSuccessful(result)}`);
      console.log(`   Is Failed: ${paymentGateway.isPaymentFailed(result)}`);
      console.log(`   Status Message: ${paymentGateway.getStatusMessage(result)}`);
    }
    
    console.log('');

    // Test 2: Test non-existent order
    console.log('2️⃣ Testing non-existent order...');
    const fakeResult = await paymentGateway.getPaymentStatus('FAKE-ORDER-ID');
    console.log(`   Found: ${fakeResult.found}`);
    console.log(`   Status: ${fakeResult.status}`);
    console.log(`   Message: ${fakeResult.message}`);
    
    console.log('\n✅ Gateway integration test completed!');
    
  } catch (error) {
    console.error('❌ Gateway test failed:', error.message);
    console.log('\n💡 Check your payment gateway credentials in .env:');
    
    if (process.env.PAYMENT_PROVIDER === 'tripay') {
      console.log('- TRIPAY_API_KEY_PRIVATE');
      console.log('- TRIPAY_BASE_URL');
    } else {
      console.log('- MIDTRANS_SERVER_KEY');
      console.log('- MIDTRANS_IS_PRODUCTION');
    }
  }
}

testGateway().then(() => {
  console.log('\n🏁 Test completed.');
  process.exit(0);
});
