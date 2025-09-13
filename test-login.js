import 'dotenv/config';

console.log('🔍 Testing Admin Login Configuration...\n');

function testLogin() {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const sessionSecret = process.env.SESSION_SECRET || 'your-secret-key-change-this';
  
  console.log('📋 Current Configuration:');
  console.log(`   Admin Password: "${adminPassword}"`);
  console.log(`   Session Secret: "${sessionSecret}"`);
  console.log(`   Node Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
  
  console.log('💡 Login Instructions:');
<<<<<<< HEAD
  console.log('1. Go to: http://store.xsramazys.biz.id:3001/admin');
=======
  console.log('1. Go to: http://localhost:3000/admin');
>>>>>>> c5406597d92f866ded9988d6dd189f3b71635b17
  console.log('2. You should be redirected to login page');
  console.log(`3. Enter password: ${adminPassword}`);
  console.log('4. Click "Masuk Dashboard"');
  console.log('5. You should be redirected to admin dashboard');
  console.log('');
  
  console.log('🔍 If login fails, check browser console for errors');
  console.log('🔍 Check server console for [AUTH] and [SESSION DEBUG] logs');
  console.log('');
  
  console.log('🛠️ Troubleshooting:');
  console.log('- Clear browser cookies/cache');
  console.log('- Check if session secret is set correctly');
<<<<<<< HEAD
  console.log('- Make sure server is running on store.xsramazys.biz.id:3001');
=======
  console.log('- Make sure server is running on localhost:3000');
>>>>>>> c5406597d92f866ded9988d6dd189f3b71635b17
  console.log('- Try incognito/private browsing mode');
}

testLogin();
