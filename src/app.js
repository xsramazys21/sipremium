import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';

// Import routes
import adminRoutes from './routes/admin.js';

// Import bot (commented out to run separately)
// import './bot/index.js'; // Bot akan dijalankan secara terpisah

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy for deployment
app.set('trust proxy', 1);

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Raw body for webhook verification
app.use('/payment/webhook', express.raw({ type: 'application/json' }));
app.use('/tripay/webhook', express.raw({ type: 'application/json' }));
app.use('/midtrans/webhook', express.raw({ type: 'application/json' }));

// Routes
app.use('/admin', adminRoutes);

// Home route
app.get('/', (req, res) => {
  res.send(`
    <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; min-height: 100vh; display: flex; flex-direction: column; justify-content: center;">
      <h1 style="font-size: 3rem; margin-bottom: 20px;">🛍️ Toko Digital Indonesia</h1>
      <p style="font-size: 1.2rem; margin-bottom: 30px;">Sistem Marketplace Digital Professional</p>
      <div style="background: rgba(255,255,255,0.1); padding: 30px; border-radius: 15px; max-width: 600px; margin: 0 auto;">
        <h2 style="margin-bottom: 20px;">📊 Panel Admin</h2>
        <p style="margin-bottom: 20px;">Kelola toko digital Anda dengan dashboard admin yang powerful</p>
        <a href="/admin" style="background: white; color: #4154f1; padding: 15px 30px; border-radius: 50px; text-decoration: none; font-weight: bold; display: inline-block; transition: transform 0.3s ease;">
          Masuk Dashboard Admin →
        </a>
      </div>
      <div style="margin-top: 40px; opacity: 0.8;">
        <small>Bot Telegram: Aktif dan siap melayani pelanggan</small>
      </div>
    </div>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
<<<<<<< HEAD
  console.log(`🚀 Server berjalan di http://34.101.189.202:${PORT}`);
  console.log(`📊 Admin Dashboard: http://34.101.189.202:${PORT}/admin`);
=======
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  console.log(`📊 Admin Dashboard: http://localhost:${PORT}/admin`);
>>>>>>> c5406597d92f866ded9988d6dd189f3b71635b17
  console.log(`🤖 Bot Telegram: Aktif dan siap melayani`);
});

export default app;
