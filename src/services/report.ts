import {query} from '../db';
export function revenueByMonth(year: number, month: number) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const rows = query<{total:number}>(`SELECT COALESCE(SUM(total),0) AS total FROM invoices WHERE substr(period_start,1,7) = ?`, [ym]);
  return rows[0]?.total ?? 0;
}
