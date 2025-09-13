import 'dotenv/config';
import db from './src/services/database.js';

console.log('🧪 Testing Dashboard Data Functions...\n');

async function testDashboard() {
  try {
    
    // Test 1: Count products
    console.log('1️⃣ Testing count products...');
    const totalProducts = await db.countRecords('products');
    console.log(`   Total products: ${totalProducts}\n`);

    // Test 2: Count orders
    console.log('2️⃣ Testing count orders...');
    const totalOrders = await db.countRecords('orders');
    console.log(`   Total orders: ${totalOrders}\n`);

    // Test 3: Count fulfilled orders
    console.log('3️⃣ Testing count fulfilled orders...');
    const fulfilledOrders = await db.countRecords('orders', { status: 'FULFILLED' });
    console.log(`   Fulfilled orders: ${fulfilledOrders}\n`);

    // Test 4: Get total revenue
    console.log('4️⃣ Testing total revenue...');
    const totalRevenue = await db.getTotalRevenue();
    console.log(`   Total revenue: Rp ${totalRevenue.toLocaleString('id-ID')}\n`);

    // Test 5: Get top products
    console.log('5️⃣ Testing top products...');
    const topProducts = await db.getTopProducts(5);
    console.log(`   Found ${topProducts.length} top products:`);
    topProducts.forEach((p, i) => {
      console.log(`   ${i+1}. ${p.name} - ${p.count} terjual - Rp ${p.price_idr.toLocaleString('id-ID')}`);
    });
    console.log('');

    // Test 6: Get recent orders
    console.log('6️⃣ Testing recent orders...');
    const recentOrders = await db.getOrders({ limit: 5 });
    console.log(`   Found ${recentOrders.length} recent orders:`);
    recentOrders.forEach((o, i) => {
      console.log(`   ${i+1}. ${o.order_id} - ${o.status} - Rp ${o.price_idr.toLocaleString('id-ID')}`);
    });
    console.log('');

    // Test 7: Sales chart data
    console.log('7️⃣ Testing sales chart data...');
    const salesData = await db.getSalesChartData(7);
    console.log(`   Chart data:`, salesData);
    console.log('');

    console.log('✅ All dashboard functions working correctly!');
    
    // Summary for dashboard
    console.log('\n📊 DASHBOARD SUMMARY:');
    console.log(`📦 Total Produk: ${totalProducts}`);
    console.log(`📋 Total Pesanan: ${totalOrders}`);
    console.log(`✅ Pesanan Selesai: ${fulfilledOrders}`);
    console.log(`💰 Total Pendapatan: Rp ${totalRevenue.toLocaleString('id-ID')}`);
    console.log(`🔥 Produk Terlaris: ${topProducts.length} items`);
    console.log(`📄 Pesanan Terbaru: ${recentOrders.length} items`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure:');
    console.log('1. Database schema is properly set up');
    console.log('2. Sample data exists in database');
    console.log('3. .env credentials are correct');
  }
}

testDashboard().then(() => {
  console.log('\n🏁 Dashboard test completed.');
  process.exit(0);
});
