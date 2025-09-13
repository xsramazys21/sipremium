import express from 'express';
import { AdminController } from '../controllers/adminController.js';
import db from '../services/database.js';

const router = express.Router();
const adminController = new AdminController();

// Admin authentication middleware
const requireAdminAuth = (req, res, next) => {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const sessionPassword = req.session?.adminPassword;
  
  if (sessionPassword === adminPassword) {
    return next();
  }
  
  if (req.path === '/login' && req.method === 'POST') {
    const { password } = req.body;
    if (password === adminPassword) {
      req.session.adminPassword = password;
      return res.redirect('/admin');
    } else {
      return res.render('admin/login', { 
        error: 'Password salah!',
        title: 'Login Admin' 
      });
    }
  }
  
  if (req.path === '/login' && req.method === 'GET') {
    return res.render('admin/login', { 
      error: null,
      title: 'Login Admin' 
    });
  }
  
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
router.get('/', adminController.getDashboard.bind(adminController));

// Products management
router.get('/products', adminController.getProducts.bind(adminController));
router.get('/products/create', (req, res) => {
  res.render('admin/product-form', {
    title: 'Tambah Produk',
    currentPage: 'products',
    product: null,
    isEdit: false
  });
});
router.get('/products/:id/edit', async (req, res) => {
  try {
    const product = await db.getProductById(parseInt(req.params.id));
    
    if (!product) {
      return res.status(404).render('error', { 
        title: 'Produk Tidak Ditemukan',
        message: 'Produk yang Anda cari tidak ditemukan atau sudah dihapus.',
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
      message: 'Gagal memuat produk untuk diedit',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

// Orders management
router.get('/orders', adminController.getOrders.bind(adminController));

// Reports
router.get('/reports', adminController.getReports.bind(adminController));

// Form submission routes
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
    console.error('Create product error:', error);
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
    console.error('Update product error:', error);
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

// API routes
router.post('/api/products', adminController.createProduct.bind(adminController));
router.put('/api/products/:id', adminController.updateProduct.bind(adminController));
router.delete('/api/products/:id', adminController.deleteProduct.bind(adminController));
router.patch('/api/products/:id/toggle', adminController.toggleProductStatus.bind(adminController));
router.post('/api/products/:id/stock', adminController.addStock.bind(adminController));

export default router;
