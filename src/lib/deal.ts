// Loan details for the bank form: amounts are kept as the agent typed them; these helpers read them.
import type { Deal } from '@/types';

export const amount = (v?: string): number | null => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return String(v ?? '').trim() && Number.isFinite(n) ? n : null;
};

/** "1430000" → "1,430,000" (no peso sign: the bank form uses plain numbers). */
export const money = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('en-PH', { maximumFractionDigits: 2 });

/** Amount financed: as typed, or unit price minus the down payment ("20%" or an amount). */
export function financed(d: Deal): number | null {
  const typed = amount(d.amount_financed);
  if (typed != null) return typed;
  const price = amount(d.unit_price);
  const dp = String(d.down_payment ?? '').trim();
  if (price == null || !dp) return null;
  if (dp.endsWith('%')) { const pct = amount(dp); return pct == null ? null : Math.round(price * (1 - pct / 100)); }
  const dpAmount = amount(dp);
  return dpAmount == null ? null : price - dpAmount;
}
