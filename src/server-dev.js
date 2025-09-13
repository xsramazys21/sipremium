import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';

// Import routes
import adminRoutes from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Development Mode - Running without strict database connection');

// Express setup
const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Always false in development
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes
app.use('/admin', adminRoutes);

// Home route
app.get('/', (req, res) => {
  res.send(`
    <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; min-height: 100vh; display: flex; flex-direction: column; justify-content: center;">
      <h1 style="font-size: 3rem; margin-bottom: 20px;">🛍️ Toko Digital Indonesia</h1>
      <p style="font-size: 1.2rem; margin-bottom: 30px;">🔧 Development Mode</p>
      <div style="background: rgba(255,255,255,0.1); padding: 30px; border-radius: 15px; max-width: 600px; margin: 0 auto;">
        <h2 style="margin-bottom: 20px;">📊 Setup Required</h2>
        <p style="margin-bottom: 20px;">Please setup your database first:</p>
        <ol style="text-align: left; margin-bottom: 20px;">
          <li>Go to <a href="https://supabase.com/dashboard/project/dmaalnzqpxgtvfmxugue" target="_blank" style="color: #ffd700;">Supabase Dashboard</a></li>
          <li>Open <strong>SQL Editor</strong></li>
          <li>Copy & paste the schema from <code>supabase/schema.sql</code></li>
          <li>Run the query</li>
          <li>Update your <code>.env</code> with correct credentials</li>
          <li>Run <code>npm start</code></li>
        </ol>
        <a href="/admin" style="background: white; color: #4154f1; padding: 15px 30px; border-radius: 50px; text-decoration: none; font-weight: bold; display: inline-block; margin-top: 20px;">
          Try Dashboard Admin →
        </a>
      </div>
      <div style="margin-top: 40px; opacity: 0.8;">
        <small>⚠️ This is development mode without database connection</small>
      </div>
    </div>
  `);
});

// Health check
app.get('/health', async (req, res) => {
  res.json({ 
    status: 'Development Mode', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: 'Please setup database first'
  });
});

// Error handling
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Halaman Tidak Ditemukan',
    message: 'Halaman yang Anda cari tidak ditemukan',
    error: {}
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).render('error', {
    title: 'Error',
    message: err.message || 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Launch server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🔧 Development server berjalan di http://34.101.189.202:${PORT}`);
  console.log(`📊 Admin Dashboard: http://34.101.189.202:${PORT}/admin`);
  console.log(`⚠️  Database connection disabled - Setup required`);
  console.log(`📋 Setup instructions: http://34.101.189.202:${PORT}`);
});

export default app;
