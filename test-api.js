import 'dotenv/config';
import axios from 'axios';

const BASE_URL = 'http://store.xsramazys.biz.id:3001';

async function testAPIs() {
  console.log('🧪 Testing Admin API Endpoints...\n');

  try {
    // Test 1: Toggle product status
    console.log('1️⃣ Testing toggle product status...');
    const toggleResponse = await axios.patch(`${BASE_URL}/admin/api/products/1/toggle`, {}, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      validateStatus: () => true // Accept all status codes
    });
    
    console.log('   Toggle Response:', toggleResponse.data);
    console.log('   Status:', toggleResponse.status);
    console.log('');

    // Test 2: Add stock
    console.log('2️⃣ Testing add stock...');
    const stockResponse = await axios.post(`${BASE_URL}/admin/api/products/1/stock`, { 
      credentials: ['test-credential-1', 'test-credential-2'] 
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      validateStatus: () => true
    });
    
    console.log('   Stock Response:', stockResponse.data);
    console.log('   Status:', stockResponse.status);
    console.log('');

    // Test 3: Delete product (use ID 999 - non-existent)
    console.log('3️⃣ Testing delete product (non-existent)...');
    const deleteResponse = await axios.delete(`${BASE_URL}/admin/api/products/999`, {
      headers: {
        'Accept': 'application/json'
      },
      validateStatus: () => true
    });
    
    console.log('   Delete Response:', deleteResponse.data);
    console.log('   Status:', deleteResponse.status);
    console.log('');

  } catch (error) {
    console.error('❌ API Test failed:', error.message);
  }
}

testAPIs().then(() => {
  console.log('🏁 API test completed.');
  process.exit(0);
});
