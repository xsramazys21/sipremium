import db from '../services/database.js';
import { formatIDR } from '../utils/formatter.js';

export class AdminController {
  // Dashboard overview
  async getDashboard(req, res) {
    try {
      // Get statistics from Supabase
      const stats = await db.getDashboardStats();

      // Get top products
      const topProducts = await db.getTopProducts(5);

      // Get recent orders
      const recentOrders = await db.getOrders({ limit: 10 });

      // Generate sales chart data for last 7 days
      const salesChartData = await db.getSalesChartData(7);

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
        title: 'Database Error',
        message: 'Gagal memuat dashboard - Periksa koneksi Supabase',
        error: process.env.NODE_ENV === 'development' ? error : {}
      });
    }
  }

  // Products management
  async getProducts(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;

      const [products, totalProducts] = await Promise.all([
        db.getProducts({ 
          limit,
          offset,
          orderBy: { column: 'created_at', ascending: false }
        }),
        db.countRecords('products')
      ]);

      // Get stock count for each product
      const productIds = products.map(p => p.id);
      const stockMap = await db.getProductsWithStock(productIds);

      // Add stock info to products
      const productsWithStock = products.map(product => ({
        ...product,
        stock: stockMap[product.id] || 0
      }));

      const totalPages = Math.ceil(totalProducts / limit);

      res.render('admin/products', {
        title: 'Kelola Produk',
        currentPage: 'products',
        products: productsWithStock,
        pagination: {
          currentPage: page,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    } catch (error) {
      console.error('Products error:', error);
      res.status(500).render('error', { 
        title: 'Products Error',
        message: 'Gagal memuat produk',
        error: process.env.NODE_ENV === 'development' ? error : {}
      });
    }
  }

  // Orders management
  async getOrders(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;
      const status = req.query.status;

      const where = status ? { status } : {};

      const [orders, totalOrders] = await Promise.all([
        prisma.order.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            product: { select: { name: true } },
            user: { select: { firstName: true, username: true, telegramId: true } }
          }
        }),
        prisma.order.count({ where })
      ]);

      const totalPages = Math.ceil(totalOrders / limit);

      res.render('admin/orders', {
        title: 'Riwayat Transaksi',
        currentPage: 'orders',
        orders,
        selectedStatus: status,
        pagination: {
          currentPage: page,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    } catch (error) {
      console.error('Orders error:', error);
      res.status(500).render('error', { 
        message: 'Gagal memuat transaksi',
        error: process.env.NODE_ENV === 'development' ? error : {}
      });
    }
  }

  // Financial reports
  async getReports(req, res) {
    try {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));

      // Monthly revenue
      const monthlyRevenue = await prisma.order.aggregate({
        where: {
          status: 'FULFILLED',
          createdAt: { gte: startOfMonth }
        },
        _sum: { priceIDR: true },
        _count: true
      });

      // Weekly revenue  
      const weeklyRevenue = await prisma.order.aggregate({
        where: {
          status: 'FULFILLED',
          createdAt: { gte: startOfWeek }
        },
        _sum: { priceIDR: true },
        _count: true
      });

      // Top products this month
      const topProductsThisMonth = await prisma.product.findMany({
        select: {
          id: true,
          name: true,
          priceIDR: true,
          _count: {
            select: {
              orders: {
                where: {
                  status: 'FULFILLED',
                  createdAt: { gte: startOfMonth }
                }
              }
            }
          }
        },
        orderBy: {
          orders: {
            _count: 'desc'
          }
        },
        take: 10
      });

      // Revenue by day (last 30 days)
      const revenueByDay = await this.getRevenueByDay(30);

      res.render('admin/reports', {
        title: 'Laporan Keuangan',
        currentPage: 'reports',
        monthlyRevenue: {
          total: monthlyRevenue._sum.priceIDR || 0,
          orders: monthlyRevenue._count
        },
        weeklyRevenue: {
          total: weeklyRevenue._sum.priceIDR || 0,
          orders: weeklyRevenue._count
        },
        topProductsThisMonth,
        revenueByDay
      });
    } catch (error) {
      console.error('Reports error:', error);
      res.status(500).render('error', { 
        message: 'Gagal memuat laporan',
        error: process.env.NODE_ENV === 'development' ? error : {}
      });
    }
  }

  // API endpoints
  async createProduct(req, res) {
    try {
      const { name, description, priceIDR, slug, isActive } = req.body;
      
      const product = await db.createProduct({
        name,
        description: description || null,
        price_idr: parseInt(priceIDR),
        slug,
        is_active: isActive !== false
      });

      res.json({ success: true, product });
    } catch (error) {
      console.error('Create product error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Gagal membuat produk: ' + error.message
      });
    }
  }

  async updateProduct(req, res) {
    try {
      const { id } = req.params;
      const { name, description, priceIDR, isActive } = req.body;
      
      const product = await db.updateProduct(parseInt(id), {
        name,
        description: description || null,
        price_idr: parseInt(priceIDR),
        is_active: isActive !== false
      });

      res.json({ success: true, product });
    } catch (error) {
      console.error('Update product error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Gagal memperbarui produk: ' + error.message
      });
    }
  }

  async deleteProduct(req, res) {
    try {
      const { id } = req.params;
      console.log('Deleting product with ID:', id);
      
      const result = await db.deleteProduct(parseInt(id));
      console.log('Delete result:', result);

      res.json({ success: true, message: 'Produk berhasil dihapus' });
    } catch (error) {
      console.error('Delete product error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Gagal menghapus produk: ' + (error.message || 'Unknown error')
      });
    }
  }

  async toggleProductStatus(req, res) {
    try {
      const { id } = req.params;
      console.log('Toggling status for product ID:', id);
      
      const updated = await db.toggleProductStatus(parseInt(id));
      console.log('Toggle result:', updated);

      res.json({ success: true, product: updated, message: 'Status produk berhasil diubah' });
    } catch (error) {
      console.error('Toggle product status error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Gagal mengubah status produk: ' + (error.message || 'Unknown error')
      });
    }
  }

  async addStock(req, res) {
    try {
      const { id } = req.params;
      const { credentials } = req.body;
      console.log('Adding stock for product ID:', id, 'credentials:', credentials);

      if (!Array.isArray(credentials) || credentials.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Kredensial harus berupa array yang tidak kosong'
        });
      }

      const validCredentials = credentials
        .map(c => String(c).trim())
        .filter(c => c.length > 0);

      if (validCredentials.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Tidak ada kredensial yang valid'
        });
      }

      const result = await db.addProductStock(parseInt(id), validCredentials);
      console.log('Add stock result:', result);

      res.json({ 
        success: true, 
        added: result.length,
        message: `${result.length} kredensial berhasil ditambahkan`
      });
    } catch (error) {
      console.error('Add stock error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Gagal menambah stok: ' + (error.message || 'Unknown error')
      });
    }
  }

  // Helper methods
  async getSalesChartData(days = 7) {
    const dates = [];
    const data = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const revenue = await prisma.order.aggregate({
        where: {
          status: 'FULFILLED',
          createdAt: {
            gte: date,
            lt: nextDate
          }
        },
        _sum: { priceIDR: true }
      });
      
      dates.push(date.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }));
      data.push(revenue._sum.priceIDR || 0);
    }
    
    return { labels: dates, data };
  }

  async getRevenueByDay(days = 30) {
    const revenue = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const dayRevenue = await prisma.order.aggregate({
        where: {
          status: 'FULFILLED',
          createdAt: {
            gte: date,
            lt: nextDate
          }
        },
        _sum: { priceIDR: true },
        _count: true
      });
      
      revenue.push({
        date: date.toISOString().split('T')[0],
        revenue: dayRevenue._sum.priceIDR || 0,
        orders: dayRevenue._count
      });
    }
    
    return revenue;
  }
}
