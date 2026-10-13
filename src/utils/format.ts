export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function calculateDiscount(original: number, selling: number): number {
  if (original <= 0) return 0;
  return Math.round(((original - selling) / original) * 100);
}
