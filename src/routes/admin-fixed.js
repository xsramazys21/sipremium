import express from 'express';
import db from '../services/database.js';

const router = express.Router();

// Middleware untuk logging
router.use((req, res, next) => {
  console.log(`[ADMIN API] ${req.method} ${req.path}`, req.body || {});
  next();
});

// Admin authentication middleware
const requireAdminAuth = (req, res, next) => {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const sessionPassword = req.session?.adminPassword;
  
  console.log(`[AUTH] Path: ${req.path}, Method: ${req.method}`);
  console.log(`[AUTH] Admin Password: ${adminPassword}`);
  console.log(`[AUTH] Session Password: ${sessionPassword}`);
  console.log(`[AUTH] Session ID: ${req.sessionID}`);
  
  if (sessionPassword === adminPassword) {
    console.log('[AUTH] ✅ Authentication successful');
    return next();
  }
  
  if (req.path === '/login' && req.method === 'POST') {
    const { password } = req.body;
    console.log(`[AUTH] Login attempt with password: ${password}`);
    
    if (password === adminPassword) {
      req.session.adminPassword = password;
      console.log('[AUTH] ✅ Password correct, setting session');
      
      // Save session explicitly
      req.session.save((err) => {
        if (err) {
          console.error('[AUTH] ❌ Session save error:', err);
          return res.render('admin/login', { 
            error: 'Gagal menyimpan session. Coba lagi.',
            title: 'Login Admin' 
          });
        }
        console.log('[AUTH] ✅ Session saved, redirecting to /admin');
        return res.redirect('/admin');
      });
      return;
    } else {
      console.log('[AUTH] ❌ Wrong password');
      return res.render('admin/login', { 
        error: 'Password salah!',
        title: 'Login Admin' 
      });
    }
  }
  
  if (req.path === '/login' && req.method === 'GET') {
    console.log('[AUTH] Showing login form');
    return res.render('admin/login', { 
      error: null,
      title: 'Login Admin' 
    });
  }
  
  console.log('[AUTH] ❌ Not authenticated, redirecting to login');
  return res.redirect('/admin/login');
};

// Login routes
router.get('/login', requireAdminAuth);
router.post('/login', requireAdminAuth);

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Protected admin routes
router.use(requireAdminAuth);

// Dashboard
router.get('/', async (req, res) => {
  try {
    console.log('Loading dashboard with real data...');
    
    // Get real statistics from database
    const [totalProducts, totalOrders, fulfilledOrders, totalRevenue] = await Promise.all([
      db.countRecords('products'),
      db.countRecords('orders'),
      db.countRecords('orders', { status: 'FULFILLED' }),
      db.getTotalRevenue()
    ]);

    console.log('Dashboard stats:', { totalProducts, totalOrders, fulfilledOrders, totalRevenue });

    // Get top products (by order count)
    const topProducts = await db.getTopProducts(5);
    console.log('Top products:', topProducts);

    // Get recent orders
    const recentOrders = await db.getOrders({ limit: 10 });
    console.log('Recent orders count:', recentOrders.length);

    // Generate sales chart data for last 7 days
    const salesChartData = await db.getSalesChartData(7);
    console.log('Sales chart data:', salesChartData);

    const stats = {
      totalProducts,
      totalOrders,
      fulfilledOrders,
      totalRevenue: totalRevenue || 0
    };

    res.render('admin/dashboard', {
      title: 'Dashboard',
      currentPage: 'dashboard',
      stats,
      topProducts,
      recentOrders,
      salesChartData
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('error', { 
      title: 'Dashboard Error',
      message: 'Gagal memuat dashboard: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

// Products management
router.get('/products', async (req, res) => {
  try {
    const products = await db.getProducts({ limit: 50 });
    
    // Add stock info
    const productIds = products.map(p => p.id);
    const stockMap = await db.getProductsWithStock(productIds);
    
    const productsWithStock = products.map(product => ({
      ...product,
      stock: stockMap[product.id] || 0
    }));

    res.render('admin/products', {
      title: 'Kelola Produk',
      currentPage: 'products',
      products: productsWithStock,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false
      }
    });
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).render('error', { 
      title: 'Products Error',
      message: 'Gagal memuat produk: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

// Create product form
router.get('/products/create', (req, res) => {
  res.render('admin/product-form', {
    title: 'Tambah Produk',
    currentPage: 'products',
    product: null,
    isEdit: false
  });
});

// Edit product form
router.get('/products/:id/edit', async (req, res) => {
  try {
    const product = await db.getProductById(parseInt(req.params.id));
    
    if (!product) {
      return res.status(404).render('error', { 
        title: 'Produk Tidak Ditemukan',
        message: 'Produk yang Anda cari tidak ditemukan.',
        error: {}
      });
    }
    
    res.render('admin/product-form', {
      title: 'Edit Produk',
      currentPage: 'products',
      product,
      isEdit: true
    });
  } catch (error) {
    console.error('Get product for edit error:', error);
    res.status(500).render('error', { 
      title: 'Server Error',
      message: 'Gagal memuat produk: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

// === API ROUTES ===

// Create product
router.post('/api/products', async (req, res) => {
  try {
    console.log('Creating product:', req.body);
    const { name, description, priceIDR, slug, isActive } = req.body;
    
    const product = await db.createProduct({
      name,
      description: description || null,
      price_idr: parseInt(priceIDR),
      slug,
      is_active: isActive !== false
    });

    console.log('Created product:', product);
    res.json({ success: true, product, message: 'Produk berhasil dibuat' });
  } catch (error) {
    console.error('Create product API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal membuat produk: ' + error.message
    });
  }
});

// Update product
router.put('/api/products/:id', async (req, res) => {
  try {
    console.log('Updating product:', req.params.id, req.body);
    const { id } = req.params;
    const { name, description, priceIDR, isActive } = req.body;
    
    const product = await db.updateProduct(parseInt(id), {
      name,
      description: description || null,
      price_idr: parseInt(priceIDR),
      is_active: isActive !== false
    });

    console.log('Updated product:', product);
    res.json({ success: true, product, message: 'Produk berhasil diperbarui' });
  } catch (error) {
    console.error('Update product API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal memperbarui produk: ' + error.message
    });
  }
});

// Delete product
router.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Deleting product with ID:', id);
    
    const result = await db.deleteProduct(parseInt(id));
    console.log('Delete result:', result);

    res.json({ success: true, message: 'Produk berhasil dihapus' });
  } catch (error) {
    console.error('Delete product API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal menghapus produk: ' + error.message
    });
  }
});

// Toggle product status
router.patch('/api/products/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('API: Toggling status for product ID:', id);
    
    const updated = await db.toggleProductStatus(parseInt(id));
    console.log('API: Toggle result:', updated);

    res.json({ 
      success: true, 
      product: updated, 
      message: `Produk ${updated.is_active ? 'diaktifkan' : 'dinonaktifkan'}` 
    });
  } catch (error) {
    console.error('API: Toggle product status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal mengubah status produk: ' + error.message
    });
  }
});

// Add stock
router.post('/api/products/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { credentials } = req.body;
    console.log('API: Adding stock for product ID:', id, 'credentials count:', credentials?.length);

    if (!Array.isArray(credentials) || credentials.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Kredensial harus berupa array yang tidak kosong'
      });
    }

    const result = await db.addProductStock(parseInt(id), credentials);
    console.log('API: Add stock result:', result);

    res.json({ 
      success: true, 
      added: result.length,
      message: `${result.length} kredensial berhasil ditambahkan`
    });
  } catch (error) {
    console.error('API: Add stock error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal menambah stok: ' + error.message
    });
  }
});

// Form submission routes (non-API)
router.post('/products', async (req, res) => {
  try {
    const { name, description, priceIDR, slug, isActive } = req.body;
    
    const product = await db.createProduct({
      name,
      description: description || null,
      price_idr: parseInt(priceIDR),
      slug,
      is_active: isActive === 'true'
    });

    res.redirect('/admin/products?success=created');
  } catch (error) {
    console.error('Form create product error:', error);
    res.render('admin/product-form', {
      title: 'Tambah Produk',
      currentPage: 'products',
      product: req.body,
      isEdit: false,
      error: 'Gagal membuat produk: ' + error.message
    });
  }
});

router.post('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, priceIDR, isActive } = req.body;
    
    const product = await db.updateProduct(parseInt(id), {
      name,
      description: description || null,
      price_idr: parseInt(priceIDR),
      is_active: isActive === 'true'
    });

    res.redirect('/admin/products?success=updated');
  } catch (error) {
    console.error('Form update product error:', error);
    const product = await db.getProductById(parseInt(req.params.id));
    res.render('admin/product-form', {
      title: 'Edit Produk',
      currentPage: 'products',
      product: { ...product, ...req.body },
      isEdit: true,
      error: 'Gagal memperbarui produk: ' + error.message
    });
  }
});

export default router;
