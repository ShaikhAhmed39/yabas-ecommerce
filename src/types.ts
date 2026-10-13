export interface Product {
  id: string;
  title: string;
  description: string;
  original_price: number;
  selling_price: number;
  discount_percent: number;
  stock: number;
  image_url: string;
  material_type: string;
  polish_finish: string;
  dimensions: string;
  category: string;
  sub_category: string;
  occasion_wear: string;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  id?: string;
  order_id?: string;
  product_id: string | null;
  product_title: string;
  unit_price: number;
  quantity: number;
  created_at?: string;
}

export interface Order {
  id: string;
  user_id: string | null;
  total_amount: number;
  status: string;
  payment_method: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  payment_status: string;
  paid_at: string | null;
  payment_error: string | null;
  customer_name: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  city: string;
  state: string;
  pincode: string;
  primary_phone: string;
  backup_phone: string | null;
  cod_fee: number;
  created_at: string;
}

export interface GoldPrice {
  price_per_gram_24k: number;
  price_per_gram_22k: number;
  price_per_gram_18k: number;
  currency: string;
  timestamp: string;
  source: string;
  error?: string;
}

export interface ProductInput {
  title: string;
  description?: string;
  original_price?: number;
  selling_price: number;
  discount_percent?: number;
  stock: number;
  image_url?: string;
  material_type?: string;
  polish_finish?: string;
  dimensions?: string;
  category?: string;
  sub_category?: string;
  occasion_wear?: string;
  is_featured?: boolean;
}