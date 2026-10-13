/*
# Create products and orders tables for Yaba's Imitation & Jewellery

## Overview
This migration creates the core schema for a jewelry storefront:
- `products` table: stores jewelry catalog items with specs, pricing, and stock
- `orders` table: stores customer checkout orders with shipping details
- Storage bucket `product-images` for product photos

## New Tables

### products
- `id` (uuid, primary key)
- `title` (text, not null) - product name
- `description` (text) - product description
- `original_price` (numeric, 10,2) - MRP for strike-through display
- `selling_price` (numeric, 10,2, not null) - active selling price
- `discount_percent` (integer) - calculated discount for badge display
- `stock` (integer, not null, default 0) - available inventory count
- `image_url` (text) - URL to product image in storage
- `material_type` (text) - e.g. "Brass", "Copper", "Stainless Steel"
- `polish_finish` (text) - e.g. "Gold Plated", "Silver Plated", "Rose Gold"
- `dimensions` (text) - e.g. "18mm x 12mm"
- `category` (text) - e.g. "Necklace", "Earrings", "Bangles", "Rings"
- `is_featured` (boolean, default false) - show on homepage hero
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### orders
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users) - buyer
- `items` (jsonb, not null) - array of {product_id, title, price, qty}
- `total` (numeric, 10,2, not null) - order total
- `full_name` (text, not null)
- `address_line_1` (text, not null)
- `address_line_2` (text)
- `city` (text, not null)
- `state` (text, not null)
- `pincode` (text, not null) - 6-digit Indian postal code
- `primary_phone` (text, not null)
- `backup_phone` (text)
- `status` (text, default 'pending')
- `created_at` (timestamptz, default now())

## Security
- RLS enabled on both tables
- products: public read (anon + authenticated), admin write (authenticated)
- orders: owner-scoped CRUD (authenticated users see only their own orders)
- Storage bucket `product-images` is public for reading
*/

-- ============================================================
-- PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  original_price numeric(10,2) DEFAULT 0,
  selling_price numeric(10,2) NOT NULL DEFAULT 0,
  discount_percent integer DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  image_url text DEFAULT '',
  material_type text DEFAULT '',
  polish_finish text DEFAULT '',
  dimensions text DEFAULT '',
  category text DEFAULT '',
  is_featured boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Public can read products
DROP POLICY IF EXISTS "public_read_products" ON products;
CREATE POLICY "public_read_products"
  ON products FOR SELECT
  TO anon, authenticated USING (true);

-- Authenticated can insert (admin)
DROP POLICY IF EXISTS "auth_insert_products" ON products;
CREATE POLICY "auth_insert_products"
  ON products FOR INSERT
  TO authenticated WITH CHECK (true);

-- Authenticated can update (admin)
DROP POLICY IF EXISTS "auth_update_products" ON products;
CREATE POLICY "auth_update_products"
  ON products FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Authenticated can delete (admin)
DROP POLICY IF EXISTS "auth_delete_products" ON products;
CREATE POLICY "auth_delete_products"
  ON products FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric(10,2) NOT NULL DEFAULT 0,
  full_name text NOT NULL,
  address_line_1 text NOT NULL,
  address_line_2 text DEFAULT '',
  city text NOT NULL,
  state text NOT NULL,
  pincode text NOT NULL,
  primary_phone text NOT NULL,
  backup_phone text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can read only their own orders
DROP POLICY IF EXISTS "select_own_orders" ON orders;
CREATE POLICY "select_own_orders"
  ON orders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Users can insert their own orders
DROP POLICY IF EXISTS "insert_own_orders" ON orders;
CREATE POLICY "insert_own_orders"
  ON orders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can update their own orders
DROP POLICY IF EXISTS "update_own_orders" ON orders;
CREATE POLICY "update_own_orders"
  ON orders FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Users can delete their own orders
DROP POLICY IF EXISTS "delete_own_orders" ON orders;
CREATE POLICY "delete_own_orders"
  ON orders FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public can read product images
DROP POLICY IF EXISTS "public_read_product_images" ON storage.objects;
CREATE POLICY "public_read_product_images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'product-images');

-- Authenticated can upload product images
DROP POLICY IF EXISTS "auth_upload_product_images" ON storage.objects;
CREATE POLICY "auth_upload_product_images"
  ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'product-images');

-- Authenticated can update product images
DROP POLICY IF EXISTS "auth_update_product_images" ON storage.objects;
CREATE POLICY "auth_update_product_images"
  ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'product-images') WITH CHECK (bucket_id = 'product-images');

-- Authenticated can delete product images
DROP POLICY IF EXISTS "auth_delete_product_images" ON storage.objects;
CREATE POLICY "auth_delete_product_images"
  ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'product-images');
