import type { Refund } from '@/lib/orders';

export interface AdminShipment {
  id: string;
  order_id: string;
  return_request_id: string | null;
  direction: 'forward' | 'return';
  status: string;
  attempt: number;
  awb_code: string | null;
  courier_name: string | null;
  tracking_url: string | null;
  label_url: string | null;
  error: string | null;
  pickup_scheduled_at: string | null;
  etd: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  last_event_at: string | null;
  raw_status: string | null;
  created_at: string;
}

export interface AdminRefund extends Refund {
  error: string | null;
}

export interface AdminReturn {
  id: string;
  order_id: string;
  order_item_id: string;
  status: string;
  reason: string;
  description: string;
  admin_note: string | null;
  rejection_reason: string | null;
  pickup_scheduled_at: string | null;
  refund_amount: number | null;
  created_at: string;
  photo_count?: number;
  photo_paths?: string[];
}

export interface AdminOrderItem {
  id: string;
  order_id: string;
  product_title: string;
  unit_price: number | string;
  quantity: number;
}

export interface AdminOrder {
  id: string;
  order_number: string | null;
  user_id: string | null;
  total_amount: number | string;
  status: string | null;
  payment_method: string | null;
  customer_name: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  primary_phone: string | null;
  backup_phone: string | null;
  created_at: string;
  paid_at: string | null;
  payment_status: string;
  delivery_status: string;
  delivered_at: string | null;
  inventory_status: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  refunded_amount: number | string | null;
  needs_attention: boolean;
  attention_reason: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  items: AdminOrderItem[];
  shipments: AdminShipment[];
  returns: AdminReturn[];
  refunds: AdminRefund[];
}

export interface OrderEvent {
  id: string;
  created_at: string;
  actor_type: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  note: string | null;
}
