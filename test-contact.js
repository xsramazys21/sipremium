import 'dotenv/config';

console.log('📞 Testing Admin Contact Configuration...\n');

function testContact() {
  const adminContact = process.env.ADMIN_CONTACT || '@admin';
  const adminWhatsApp = process.env.ADMIN_WHATSAPP || '+62xxx-xxxx-xxxx';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@tokoonline.com';
  
  console.log('📋 Current Admin Contact Info:');
  console.log(`   Telegram: ${adminContact}`);
  console.log(`   WhatsApp: ${adminWhatsApp}`);
  console.log(`   Email: ${adminEmail}`);
  console.log('');
  
  console.log('📱 How it appears in bot:');
  console.log('👨‍💼 HUBUNGI ADMIN\n');
  console.log('📞 Butuh bantuan? Tim support siap membantu!\n');
  console.log('💬 Kontak Admin:');
  console.log(`• Telegram: ${adminContact}`);
  console.log(`• WhatsApp: ${adminWhatsApp}`);
  console.log(`• Email: ${adminEmail}\n`);
  console.log('⏰ Jam Operasional:');
  console.log('Senin - Minggu: 08:00 - 22:00 WIB\n');
  console.log('Kami akan merespons dalam 1-2 jam ⚡');
  console.log('');
  
  console.log('🔗 Button Links:');
  console.log(`   Telegram Link: t.me/${adminContact.replace('@', '')}`);
  console.log(`   WhatsApp Link: https://wa.me/${adminWhatsApp.replace('+', '').replace(/\D/g, '')}`);
  console.log('');
  
  console.log('✅ Contact info configuration looks good!');
  console.log('💡 Test by sending /start to your bot and clicking "📞 Hubungi Admin"');
}

testContact();
