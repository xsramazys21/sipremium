import 'dotenv/config';
import db from './src/services/database.js';
import orderCleanup from './src/services/orderCleanup.js';

console.log('🗑️ Gateway-Based Order Cleanup Tool\n');

async function cleanupOrders() {
  try {
    console.log('Starting gateway-based cleanup process...\n');

    // 1. Show current order status summary
    console.log('📊 Current order status summary (from database):');
    const allOrders = await db.getOrders({ includeAll: true, limit: 100 });
    const statusCount = {};
    
    allOrders.forEach(order => {
      statusCount[order.status] = (statusCount[order.status] || 0) + 1;
    });
    
    Object.entries(statusCount).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} orders`);
    });
    console.log(`   Total in DB: ${allOrders.length} orders\n`);

    // 2. Gateway-based cleanup (check real status)
    console.log('🔍 Checking all orders against payment gateway...');
    const summary = await orderCleanup.cleanupOrdersBasedOnGatewayStatus();
    
    // 3. Cleanup old orders (>2 hours)
    console.log('\n⏰ Cleaning up old orders (>2 hours) with gateway verification...');
    const deletedOld = await orderCleanup.cleanupOldOrders(2);
    
    // 4. Show final summary
    console.log('\n✅ Gateway-based cleanup completed!');
    console.log(`📊 Processed: ${summary.processed} orders`);
    console.log(`✅ Auto-fulfilled: ${summary.fulfilled} orders`);
    console.log(`🗑️ Deleted expired: ${summary.deleted} orders`);
    console.log(`🕐 Deleted old: ${deletedOld} orders`);
    console.log(`⏳ Kept pending: ${summary.kept} orders`);
    console.log(`📊 Total removed: ${summary.deleted + deletedOld} orders`);
    
    // 5. Show final database state
    console.log('\n📋 Final database state (only PENDING and FULFILLED):');
    const finalOrders = await db.getOrders({ limit: 100 });
    console.log(`   ${finalOrders.length} orders remaining in database`);
    
    const finalStatusCount = {};
    finalOrders.forEach(order => {
      finalStatusCount[order.status] = (finalStatusCount[order.status] || 0) + 1;
    });
    
    Object.entries(finalStatusCount).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} orders`);
    });
    
    console.log('\n🎯 Database is now optimized with gateway-verified data!');
    console.log('💡 Only valid transactions (PENDING + FULFILLED) are kept');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
}

cleanupOrders().then(() => {
  console.log('\n🏁 Cleanup completed.');
  process.exit(0);
});
