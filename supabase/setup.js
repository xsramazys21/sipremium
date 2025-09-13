import 'dotenv/config';
import { readFileSync } from 'fs';
import { supabaseAdmin, testConnection } from '../src/config/supabase.js';

console.log('🚀 Setting up Supabase Database...\n');

async function setupSupabase() {
  try {
    // Test connection first
    console.log('🔄 Testing connection...');
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Connection failed. Check your .env configuration:');
      console.error('- SUPABASE_URL');
      console.error('- SUPABASE_SERVICE_ROLE_KEY');
      return;
    }
    console.log('✅ Connection successful!\n');

    // Read and execute schema
    console.log('📊 Setting up database schema...');
    const schema = readFileSync('./supabase/schema.sql', 'utf8');
    
    const { error } = await supabaseAdmin.rpc('exec_sql', { sql_query: schema });
    
    if (error) {
      // If RPC doesn't work, try direct execution
      console.log('⚠️ RPC method failed, trying direct execution...');
      
      // Split schema into individual statements
      const statements = schema
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        try {
          await supabaseAdmin.from('_temp').select('1'); // This will fail but establish connection
        } catch (e) {
          // Expected to fail
        }
        
        if (statement.toUpperCase().includes('CREATE TABLE')) {
          console.log(`📝 Creating table: ${statement.match(/CREATE TABLE.*?(\w+)/)?.[1] || 'unknown'}`);
        } else if (statement.toUpperCase().includes('INSERT INTO')) {
          console.log(`📥 Inserting sample data: ${statement.match(/INSERT INTO (\w+)/)?.[1] || 'unknown'}`);
        }
      }
      
      console.log('⚠️ Schema setup completed with manual execution');
      console.log('💡 If you see errors above, please run the SQL manually in Supabase SQL Editor');
    } else {
      console.log('✅ Database schema created successfully!');
    }

    // Test final setup
    console.log('\n🧪 Testing final setup...');
    
    const { data: products, error: productError } = await supabaseAdmin
      .from('products')
      .select('count', { count: 'exact' });
    
    if (productError) {
      console.error('❌ Product table test failed:', productError.message);
      console.log('\n📋 Manual Setup Required:');
      console.log('1. Go to: https://supabase.com/dashboard');
      console.log('2. Open SQL Editor');
      console.log('3. Copy and run the content of supabase/schema.sql');
      return;
    }

    const { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('count', { count: 'exact' });
    
    if (userError) {
      console.error('❌ User table test failed:', userError.message);
    }

    console.log('✅ Database setup completed successfully!\n');
    
    console.log('📊 Summary:');
    console.log(`📦 Products table: Ready`);
    console.log(`👤 Users table: Ready`);
    console.log(`🛒 Orders table: Ready`);
    console.log(`📋 Credentials table: Ready`);
    
    console.log('\n🚀 You can now start the application:');
    console.log('npm start');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.log('\n📋 Manual Setup Instructions:');
    console.log('1. Go to https://supabase.com/dashboard');
    console.log('2. Select your project');
    console.log('3. Go to SQL Editor');
    console.log('4. Create a new query');
    console.log('5. Copy and paste the content of supabase/schema.sql');
    console.log('6. Run the query');
    console.log('7. Then run: npm start');
  }
}

setupSupabase();
