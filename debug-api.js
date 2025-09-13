import axios from 'axios';

console.log('🔍 Debug: Checking API routes...\n');

async function quickTest() {
  try {
    console.log('Testing server health...');
    
    // Test health endpoint
<<<<<<< HEAD
    const healthResponse = await axios.get('http://store.xsramazys.biz.id:3001/health');
=======
    const healthResponse = await axios.get('http://localhost:3000/health');
>>>>>>> c5406597d92f866ded9988d6dd189f3b71635b17
    console.log('Health check:', healthResponse.data);
    
    // Test API with a simple GET (if exists)
    console.log('\nTesting admin API...');
<<<<<<< HEAD
    const response = await axios.patch('http://store.xsramazys.biz.id:3001/admin/api/products/1/toggle', {}, {
=======
    const response = await axios.patch('http://localhost:3000/admin/api/products/1/toggle', {}, {
>>>>>>> c5406597d92f866ded9988d6dd189f3b71635b17
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
