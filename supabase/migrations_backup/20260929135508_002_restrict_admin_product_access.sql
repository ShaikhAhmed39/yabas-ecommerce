/*
# Restrict catalog management to verified administrators

## Overview
This migration separates customer accounts from administration. Customers can continue to browse products and place orders, but only accounts explicitly listed in `admin_users` can create, edit, delete, or upload product assets.

## New Tables
- `admin_users`
  - `user_id` (uuid, primary key, references auth.users) - the account granted admin access
  - `created_at` (timestamptz) - grant timestamp

## Modified Access Rules
- `products` write policies now require a matching row in `admin_users`.
- `storage.objects` product-image write policies now require a matching row in `admin_users`.
- Public product reads and authenticated customer order access remain unchanged.

## Security
- RLS is enabled on `admin_users`.
- Authenticated users can only check whether their own account is listed.
- No anonymous account can read or write administrator records.

## Important Notes
1. Adding an administrator is an operator action: insert the user's auth ID into `admin_users` using a trusted database session.
2. Customer signup never grants administrator privileges.
3. This protects the database even if a customer bypasses the storefront and calls the Supabase API directly.
*/

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_own_grant" ON public.admin_users;
CREATE POLICY "admins_read_own_grant"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth_insert_products" ON public.products;
CREATE POLICY "auth_insert_products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "auth_update_products" ON public.products;
CREATE POLICY "auth_update_products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "auth_delete_products" ON public.products;
CREATE POLICY "auth_delete_products"
  ON public.products FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "auth_upload_product_images" ON storage.objects;
CREATE POLICY "auth_upload_product_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "auth_update_product_images" ON storage.objects;
CREATE POLICY "auth_update_product_images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "auth_delete_product_images" ON storage.objects;
CREATE POLICY "auth_delete_product_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );
