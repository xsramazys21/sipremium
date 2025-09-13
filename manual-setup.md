# 📋 Manual Supabase Setup

Karena ada kendala dengan auto-setup, berikut cara manual setup database Supabase:

## 🔧 **1. Buka Supabase Dashboard**

1. Go to: **https://supabase.com/dashboard/project/dmaalnzqpxgtvfmxugue**
2. Login dengan akun Anda
3. Klik project: **dmaalnzqpxgtvfmxugue**

## 📊 **2. Buka SQL Editor**

1. Di sidebar kiri, klik **SQL Editor**
2. Klik **New Query**

## 📋 **3. Copy & Paste Schema**

Copy semua kode SQL dari file `supabase/schema.sql` dan paste ke SQL Editor:

```sql
-- Toko Digital Indonesia - Database Schema
-- Run this SQL in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id TEXT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products table  
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    price_idr INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product credentials (stock)
CREATE TABLE IF NOT EXISTS product_credentials (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    payload TEXT NOT NULL,
    is_used BOOLEAN DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_id TEXT UNIQUE NOT NULL,
    midtrans_order_id TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    price_idr INTEGER NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'FULFILLED', 'FAILED', 'CANCELED')),
    delivered_payload TEXT,
    last_midtrans_state TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_product_credentials_product_id ON product_credentials(product_id);
CREATE INDEX IF NOT EXISTS idx_product_credentials_unused ON product_credentials(product_id, is_used) WHERE is_used = false;
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Sample data
INSERT INTO products (name, slug, description, price_idr, is_active) VALUES
('Netflix Premium 1 Bulan', 'netflix-premium-1-bulan', 'Akun Netflix Premium untuk 1 bulan, kualitas 4K', 65000, true),
('Spotify Premium 3 Bulan', 'spotify-premium-3-bulan', 'Akun Spotify Premium untuk 3 bulan, tanpa iklan', 45000, true),
('Canva Pro 1 Tahun', 'canva-pro-1-tahun', 'Akun Canva Pro untuk 1 tahun penuh', 120000, true),
('Disney+ Hotstar 1 Bulan', 'disney-hotstar-1-bulan', 'Akun Disney+ Hotstar Premium untuk 1 bulan', 39000, true),
('YouTube Premium 2 Bulan', 'youtube-premium-2-bulan', 'YouTube Premium tanpa iklan untuk 2 bulan', 55000, true)
ON CONFLICT (slug) DO NOTHING;

-- Sample stock for first product
INSERT INTO product_credentials (product_id, payload) 
SELECT 1, 'netflix-premium-' || gen_random_uuid() || '@email.com:password' || (ROW_NUMBER() OVER())
FROM generate_series(1, 10)
WHERE EXISTS (SELECT 1 FROM products WHERE id = 1);

-- Functions for statistics
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
    total_products INTEGER;
    total_orders INTEGER;
    fulfilled_orders INTEGER;
    total_revenue BIGINT;
BEGIN
    SELECT COUNT(*) INTO total_products FROM products;
    SELECT COUNT(*) INTO total_orders FROM orders;
    SELECT COUNT(*) INTO fulfilled_orders FROM orders WHERE status = 'FULFILLED';
    SELECT COALESCE(SUM(price_idr), 0) INTO total_revenue FROM orders WHERE status = 'FULFILLED';
    
    RETURN json_build_object(
        'totalProducts', total_products,
        'totalOrders', total_orders,
        'fulfilledOrders', fulfilled_orders,
        'totalRevenue', total_revenue
    );
END;
$$ LANGUAGE plpgsql;
```

## ▶️ **4. Run Query**

1. Klik tombol **RUN** atau tekan **Ctrl+Enter**
2. Tunggu sampai selesai (mungkin beberapa detik)
3. Periksa apakah ada error. Jika ada, perbaiki dan run ulang

## ✅ **5. Verifikasi**

1. Di sidebar kiri Supabase, klik **Table Editor**
2. Pastikan tabel berikut sudah ada:
   - `users`
   - `products` (dengan 5 produk sample)
   - `product_credentials` (dengan sample stock)
   - `orders`

## 🚀 **6. Test Aplikasi**

Setelah database setup selesai:

```bash
npm start
```

Kemudian buka: **http://localhost:3000/admin**

## 🆘 **Troubleshooting**

### Jika Error "gen_random_uuid() doesn't exist":
Ganti `gen_random_uuid()` dengan `uuid_generate_v4()` di bagian sample stock.

### Jika Error "generate_series doesn't work":
Replace bagian sample stock dengan:
```sql
-- Manual sample stock
INSERT INTO product_credentials (product_id, payload) VALUES
(1, 'netflix-premium-001@email.com:password001'),
(1, 'netflix-premium-002@email.com:password002'),
(1, 'netflix-premium-003@email.com:password003'),
(1, 'netflix-premium-004@email.com:password004'),
(1, 'netflix-premium-005@email.com:password005');
```

### Jika masih ada masalah:
1. Check kredensial Supabase di `.env`
2. Pastikan Service Role Key benar
3. Coba restart aplikasi
