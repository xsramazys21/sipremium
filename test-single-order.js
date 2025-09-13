import 'dotenv/config';
import paymentGateway from './src/services/paymentGateway.js';
import db from './src/services/database.js';

const orderId = process.argv[2];

if (!orderId) {
  console.log('❌ Usage: node test-single-order.js <ORDER_ID>');
  console.log('Example: node test-single-order.js ORD-ABC123');
  process.exit(1);
}

console.log(`🔍 Testing single order: ${orderId}\n`);

async function testSingleOrder() {
  try {
    
    // 1. Check database first
    console.log('1️⃣ Checking database...');
    const dbOrder = await db.getOrderByOrderId(orderId);
    
    if (dbOrder) {
      console.log(`   ✅ Found in database:`);
      console.log(`      Product: ${dbOrder.products?.name}`);
      console.log(`      Status: ${dbOrder.status}`);
      console.log(`      Amount: Rp ${dbOrder.price_idr.toLocaleString('id-ID')}`);
      console.log(`      Created: ${new Date(dbOrder.created_at).toLocaleString('id-ID')}`);
    } else {
      console.log(`   ❌ Not found in database`);
    }
    console.log('');

    // 2. Check payment gateway
    console.log('2️⃣ Checking payment gateway...');
    const gatewayResult = await paymentGateway.getPaymentStatus(orderId);
    
    console.log(`   Found in gateway: ${gatewayResult.found}`);
    
    if (gatewayResult.found) {
      console.log(`   Gateway Status: ${gatewayResult.status}`);
      console.log(`   Reference: ${gatewayResult.reference || 'N/A'}`);
      console.log(`   Amount: ${gatewayResult.amount || 'N/A'}`);
      console.log(`   Method: ${gatewayResult.method || 'N/A'}`);
      
      // 3. Evaluate payment status
      console.log('\n3️⃣ Payment status evaluation:');
      console.log(`   Is Successful: ${paymentGateway.isPaymentSuccessful(gatewayResult)}`);
      console.log(`   Is Failed: ${paymentGateway.isPaymentFailed(gatewayResult)}`);
      console.log(`   Status Message: ${paymentGateway.getStatusMessage(gatewayResult)}`);
      
      // 4. Show recommended action
      console.log('\n4️⃣ Recommended action:');
      if (paymentGateway.isPaymentSuccessful(gatewayResult)) {
        console.log(`   ✅ FULFILL ORDER - Payment confirmed successful`);
      } else if (paymentGateway.isPaymentFailed(gatewayResult)) {
        console.log(`   🗑️ DELETE ORDER - Payment failed/expired`);
      } else {
        console.log(`   ⏳ KEEP PENDING - Payment still in progress`);
      }
      
    } else {
      console.log(`   ❌ ${gatewayResult.message}`);
      
      console.log('\n3️⃣ Recommended action:');
      if (dbOrder) {
        console.log(`   🗑️ DELETE ORDER - Not found in gateway but exists in database`);
      } else {
        console.log(`   ✅ ALREADY CLEAN - Not in database or gateway`);
      }
    }
    
    console.log('\n🎯 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSingleOrder().then(() => {
  console.log('\n🏁 Single order test completed.');
  process.exit(0);
});
