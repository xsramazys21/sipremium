import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env:');
  console.error('- SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Admin client with service role key (full access)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Public client with anon key (for frontend if needed)
export const supabase = createClient(
  supabaseUrl, 
  process.env.SUPABASE_ANON_KEY || supabaseServiceKey
);

// Test connection
export async function testConnection() {
  try {
    // Simple connection test - just try to make a basic query
    const { error } = await supabaseAdmin
      .from('_realtime_schema_versions') // This table always exists in Supabase
      .select('*')
      .limit(1);
    
    if (error && !error.message.includes('permission denied')) {
      // If that fails, try an even simpler approach
      const { error: simpleError } = await supabaseAdmin
        .from('products') // Try our products table
        .select('id')
        .limit(1);
      
      // If products table doesn't exist yet, that's OK - connection works
      if (simpleError && !simpleError.message.includes('does not exist')) {
        throw simpleError;
      }
    }
    
    console.log('✅ Supabase connection successful');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    console.error('💡 Tip: Make sure you have run the schema setup in Supabase SQL Editor');
    return false;
  }
}

export default supabaseAdmin;
