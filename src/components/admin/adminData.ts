import { callFunction } from '@/lib/api';
import type { AdminOrder } from '@/components/admin/adminTypes';

export interface OrdersPage { orders: AdminOrder[]; total: number; counts: Record<string, number>; mode: 'live' | 'mock' }

/** Pulls orders (with items, shipments, returns, refunds) newest first through the existing admin function. */
export async function loadOrders(maxOrders = 1000, onProgress?: (n: number) => void): Promise<OrdersPage> {
  const all: AdminOrder[] = [];
  let counts: Record<string, number> = {}; let mode: 'live' | 'mock' = 'mock'; let total = 0;
  for (let page = 0; all.length < maxOrders; page++) {
    const r = await callFunction<OrdersPage & { page_size: number }>('admin-list-orders', { view: 'all', page, page_size: 100 });
    if (page === 0) { counts = r.counts ?? {}; mode = r.mode; total = r.total; }
    all.push(...(r.orders ?? []));
    onProgress?.(all.length);
    if ((r.orders ?? []).length < 100) break;
  }
  return { orders: all.slice(0, maxOrders), total, counts, mode };
}

export const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
export const paidStatus = (o: Pick<AdminOrder, 'payment_status'>) => ['paid', 'captured', 'refunded'].includes((o.payment_status ?? '').toLowerCase());
