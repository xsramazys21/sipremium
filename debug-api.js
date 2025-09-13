import axios from 'axios';

console.log('🔍 Debug: Checking API routes...\n');

async function quickTest() {
  try {
    console.log('Testing server health...');
    
    // Test health endpoint
    const healthResponse = await axios.get('http://localhost:3000/health');
    console.log('Health check:', healthResponse.data);
    
    // Test API with a simple GET (if exists)
    console.log('\nTesting admin API...');
    const response = await axios.patch('http://localhost:3000/admin/api/products/1/toggle', {}, {
      headers: {
        'Content-Type': 'application/json'
      },
      validateStatus: () => true
    });
    
    console.log('API Response Status:', response.status);
    console.log('API Response Body:', response.data);
    
  } catch (error) {
    console.error('Test Error:', error.message);
    console.log('\n💡 Make sure server is running: npm start');
  }
}

quickTest();
