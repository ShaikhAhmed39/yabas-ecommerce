-- Add sub-category, occasion wear, payment method, and COD fee columns

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sub_category text DEFAULT '',
  ADD COLUMN IF NOT EXISTS occasion_wear text DEFAULT '';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cod',
  ADD COLUMN IF NOT EXISTS cod_fee numeric(10,2) DEFAULT 0;
