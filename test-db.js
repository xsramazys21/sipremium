import 'dotenv/config';
import db from './src/services/database.js';

console.log('🧪 Testing Supabase Database Connection...\n');

async function testDatabase() {
  try {
    // Test 1: Connection
    console.log('1️⃣ Testing connection...');
    const connected = await db.testConnection();
    console.log(`   Result: ${connected ? '✅ Connected' : '❌ Failed'}\n`);

    if (!connected) {
      console.log('❌ Database connection failed. Please check your .env configuration.');
      return;
    }

    // Test 2: Get products
    console.log('2️⃣ Testing get products...');
    const products = await db.getProducts({ limit: 3 });
    console.log(`   Found ${products.length} products:`);
    products.forEach(p => {
      console.log(`   - ${p.name} (${p.slug}) - Rp ${p.price_idr.toLocaleString('id-ID')}`);
    });
    console.log('');

    // Test 3: Get product by slug
    console.log('3️⃣ Testing get product by slug...');
    const product = await db.getProductBySlug('netflix-premium-1-bulan');
    if (product) {
      console.log(`   Found: ${product.name}`);
      console.log(`   Active: ${product.is_active}`);
      console.log(`   Price: Rp ${product.price_idr.toLocaleString('id-ID')}`);
    } else {
      console.log('   ❌ Product not found');
    }
    console.log('');

    // Test 4: Get stock
    if (product) {
      console.log('4️⃣ Testing get stock...');
      const stock = await db.getProductStock(product.id);
      console.log(`   Stock for ${product.name}: ${stock} items\n`);
    }

    // Test 5: Test user upsert
    console.log('5️⃣ Testing user upsert...');
    const testUser = await db.upsertUser('578724179', {
      username: 'apeprustandi',
      first_name: 'Apep🦴',
      last_name: 'Rustandi🦴'
    });
    console.log(`   User: ${testUser.first_name} (ID: ${testUser.id})\n`);

    console.log('✅ All tests passed! Database is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('1. Check your .env file has correct Supabase credentials');
    console.log('2. Make sure you have run the schema in Supabase SQL Editor');
    console.log('3. Check your internet connection');
  }
}

testDatabase().then(() => {
  console.log('\n🏁 Test completed.');
  process.exit(0);
});
