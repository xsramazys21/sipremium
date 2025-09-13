import { supabaseAdmin } from '../config/supabase.js';

export class DatabaseService {
  constructor() {
    this.client = supabaseAdmin;
  }

  // Users
  async createUser(userData) {
    const { data, error } = await this.client
      .from('users')
      .insert(userData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getUserByTelegramId(telegramId) {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data;
  }

  async upsertUser(telegramId, userData) {
    try {
      // First try to get existing user
      const existingUser = await this.getUserByTelegramId(telegramId);
      
      if (existingUser) {
        // Update existing user
        const { data, error } = await this.client
          .from('users')
          .update({ 
            ...userData,
            updated_at: new Date().toISOString()
          })
          .eq('telegram_id', telegramId)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        // Create new user
        const { data, error } = await this.client
          .from('users')
          .insert({ 
            telegram_id: telegramId, 
            ...userData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error('Upsert user error:', error);
      throw error;
    }
  }

  // Products
  async getProducts(options = {}) {
    let query = this.client.from('products').select('*');
    
    if (options.isActive !== undefined) {
      query = query.eq('is_active', options.isActive);
    }
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }
    
    if (options.orderBy) {
      query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending });
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async getProductBySlug(slug) {
    const { data, error } = await this.client
      .from('products')
      .select('*')
      .eq('slug', slug)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getProductById(id) {
    const { data, error } = await this.client
      .from('products')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async createProduct(productData) {
    const { data, error } = await this.client
      .from('products')
      .insert(productData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateProduct(id, productData) {
    const { data, error } = await this.client
      .from('products')
      .update({ ...productData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteProduct(id) {
    try {
      const { data, error } = await this.client
        .from('products')
        .delete()
        .eq('id', id)
        .select();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Delete product error:', error);
      throw error;
    }
  }

  async toggleProductStatus(id) {
    try {
      console.log('Toggling product status for ID:', id);
      
      // Get current status
      const product = await this.getProductById(id);
      if (!product) throw new Error('Produk tidak ditemukan');
      
      console.log('Current product:', product);
      console.log('Current status:', product.is_active, 'will change to:', !product.is_active);
      
      // Toggle status
      const { data, error } = await this.client
        .from('products')
        .update({ 
          is_active: !product.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('Supabase toggle error:', error);
        throw error;
      }
      
      console.log('Toggle result:', data);
      return data;
    } catch (error) {
      console.error('Toggle product status error:', error);
      throw error;
    }
  }

  // Product Stock
  async getProductStock(productId) {
    const { count, error } = await this.client
      .from('product_credentials')
      .select('*', { count: 'exact' })
      .eq('product_id', productId)
      .eq('is_used', false);
    
    if (error) throw error;
    return count;
  }

  async getProductsWithStock(productIds) {
    const { data, error } = await this.client
      .from('product_credentials')
      .select('product_id')
      .in('product_id', productIds)
      .eq('is_used', false);
    
    if (error) throw error;
    
    // Count stock per product
    const stockMap = {};
    data.forEach(item => {
      stockMap[item.product_id] = (stockMap[item.product_id] || 0) + 1;
    });
    
    return stockMap;
  }

  async addProductStock(productId, credentials) {
    try {
      const stockData = credentials.map(payload => ({
        product_id: productId,
        payload: payload.trim()
      })).filter(item => item.payload.length > 0);

      if (stockData.length === 0) {
        throw new Error('Tidak ada kredensial yang valid');
      }

      const { data, error } = await this.client
        .from('product_credentials')
        .insert(stockData)
        .select();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Add stock error:', error);
      throw error;
    }
  }

  async getUnusedCredential(productId) {
    const { data, error } = await this.client
      .from('product_credentials')
      .select('*')
      .eq('product_id', productId)
      .eq('is_used', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async useCredential(credentialId, payload = null) {
    const { data, error } = await this.client
      .from('product_credentials')
      .update({ 
        is_used: true, 
        used_at: new Date().toISOString() 
      })
      .eq('id', credentialId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Orders
  async createOrder(orderData) {
    const { data, error } = await this.client
      .from('orders')
      .insert(orderData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getOrderByOrderId(orderId) {
    const { data, error } = await this.client
      .from('orders')
      .select(`
        *,
        users(*),
        products(*)
      `)
      .eq('order_id', orderId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getOrdersByUserId(userId, options = {}) {
    let query = this.client
      .from('orders')
      .select(`
        *,
        products(name)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    // Default: hanya tampilkan PENDING dan FULFILLED orders
    if (!options.includeAll) {
      query = query.in('status', ['PENDING', 'FULFILLED']);
    }
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async getOrders(options = {}) {
    let query = this.client
      .from('orders')
      .select(`
        *,
        users(first_name, username, telegram_id),
        products(name)
      `)
      .order('created_at', { ascending: false });
    
    // Default: hanya tampilkan PENDING dan FULFILLED orders
    if (options.status) {
      query = query.eq('status', options.status);
    } else if (!options.includeAll) {
      query = query.in('status', ['PENDING', 'FULFILLED']);
    }
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async updateOrder(id, orderData) {
    const { data, error } = await this.client
      .from('orders')
      .update({ ...orderData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateOrderByOrderId(orderId, orderData) {
    const { data, error } = await this.client
      .from('orders')
      .update({ ...orderData, updated_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Statistics
  async getDashboardStats() {
    try {
      const { data, error } = await this.client
        .rpc('get_dashboard_stats');
      
      if (error) {
        // Fallback if RPC function doesn't exist
        console.log('RPC function not available, using manual queries...');
        return await this.getManualStats();
      }
      return data;
    } catch (error) {
      console.log('Stats RPC error, falling back to manual queries...');
      return await this.getManualStats();
    }
  }

  async getManualStats() {
    try {
      // Count only valid orders (PENDING + FULFILLED)
      const validOrdersQuery = this.client
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['PENDING', 'FULFILLED']);
      
      const { count: totalValidOrders } = await validOrdersQuery;
      
      const [totalProducts, fulfilledOrders, revenue] = await Promise.all([
        this.countRecords('products'),
        this.countRecords('orders', { status: 'FULFILLED' }),
        this.getTotalRevenue()
      ]);

      return {
        totalProducts,
        totalOrders: totalValidOrders || 0, // Hanya orders yang valid
        fulfilledOrders,
        totalRevenue: revenue
      };
    } catch (error) {
      console.error('Manual stats error:', error);
      return {
        totalProducts: 0,
        totalOrders: 0,
        fulfilledOrders: 0,
        totalRevenue: 0
      };
    }
  }

  async getTotalRevenue() {
    try {
      const { data, error } = await this.client
        .from('orders')
        .select('price_idr')
        .eq('status', 'FULFILLED');
      
      if (error) throw error;
      
      const total = data.reduce((sum, order) => sum + (order.price_idr || 0), 0);
      return total;
    } catch (error) {
      console.error('Get total revenue error:', error);
      return 0;
    }
  }

  async getSalesChartData(days = 7) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const { data, error } = await this.client
      .from('orders')
      .select('price_idr, created_at')
      .eq('status', 'FULFILLED')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    
    if (error) throw error;

    // Process data for chart
    const labels = [];
    const chartData = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayRevenue = data
        .filter(order => order.created_at.startsWith(dateStr))
        .reduce((sum, order) => sum + order.price_idr, 0);
      
      labels.push(date.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }));
      chartData.push(dayRevenue);
    }
    
    return { labels, data: chartData };
  }

  async getTopProducts(limit = 5) {
    try {
      // Get all fulfilled orders with product info
      const { data, error } = await this.client
        .from('orders')
        .select(`
          product_id,
          products!inner(name, price_idr)
        `)
        .eq('status', 'FULFILLED');
      
      if (error) throw error;

      if (!data || data.length === 0) {
        console.log('No fulfilled orders found for top products');
        return [];
      }

      // Count orders per product
      const productCount = {};
      data.forEach(order => {
        if (order.products) {
          const key = order.product_id;
          if (!productCount[key]) {
            productCount[key] = {
              id: order.product_id,
              name: order.products.name,
              price_idr: order.products.price_idr,
              count: 0
            };
          }
          productCount[key].count++;
        }
      });

      // Sort by count and limit
      const sorted = Object.values(productCount)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      console.log('Top products processed:', sorted);
      return sorted;
      
    } catch (error) {
      console.error('Get top products error:', error);
      return [];
    }
  }

  // Utility methods
  async countRecords(table, conditions = {}) {
    try {
      let query = this.client.from(table).select('*', { count: 'exact', head: true });
      
      Object.entries(conditions).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error(`Count records error for ${table}:`, error);
      return 0;
    }
  }

  async testConnection() {
    try {
      // Simple connection test
      const { data, error } = await this.client
        .from('products')
        .select('id')
        .limit(1);
      
      if (error && !error.message.includes('does not exist')) {
        throw error;
      }
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  async deleteOrder(orderId) {
    try {
      const { data, error } = await this.client
        .from('orders')
        .delete()
        .eq('order_id', orderId)
        .select();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Delete order error:', error);
      throw error;
    }
  }

  async deleteOrderById(id) {
    try {
      const { data, error } = await this.client
        .from('orders')
        .delete()
        .eq('id', id)
        .select();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Delete order by ID error:', error);
      throw error;
    }
  }

  async cleanupFailedOrders() {
    try {
      console.log('🗑️ Cleaning up failed/expired orders...');
      
      // Delete orders with failed statuses
      const failedStatuses = ['FAILED', 'EXPIRED', 'CANCELED', 'DENY', 'CANCEL'];
      
      const { data, error } = await this.client
        .from('orders')
        .delete()
        .in('status', failedStatuses)
        .select();
      
      if (error) throw error;
      
      console.log(`✅ Deleted ${data.length} failed/expired orders`);
      return data.length;
    } catch (error) {
      console.error('Cleanup failed orders error:', error);
      return 0;
    }
  }

  async cleanupOldPendingOrders(hoursOld = 24) {
    try {
      console.log(`🗑️ Cleaning up pending orders older than ${hoursOld} hours...`);
      
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hoursOld);
      
      const { data, error } = await this.client
        .from('orders')
        .delete()
        .eq('status', 'PENDING')
        .lt('created_at', cutoffTime.toISOString())
        .select();
      
      if (error) throw error;
      
      console.log(`✅ Deleted ${data.length} old pending orders`);
      return data.length;
    } catch (error) {
      console.error('Cleanup old pending orders error:', error);
      return 0;
    }
  }
}

export default new DatabaseService();
