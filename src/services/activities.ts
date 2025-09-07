import {exec, query} from '../db';
import {v4 as uuid} from 'uuid';

export function addOperatingExpense(apartmentId: string, name: string, amount: number){
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth()+1;
  const id = uuid();
  exec(`INSERT INTO operating_expenses (id, apartment_id, year, month, name, amount) VALUES (?,?,?,?,?,?)`, [id, apartmentId, y, m, name, amount]);
  return id;
}
export function listOperatingExpenses(apartmentId: string, year: number, month: number){
  return query(`SELECT * FROM operating_expenses WHERE apartment_id = ? AND year = ? AND month = ? ORDER BY created_at DESC`, [apartmentId, year, month]);
}
export function sumOperatingExpenses(apartmentId: string, year: number, month: number){
  const r = query<{total:number}>(`SELECT COALESCE(SUM(amount),0) AS total FROM operating_expenses WHERE apartment_id = ? AND year = ? AND month = ?`, [apartmentId, year, month]);
  return r[0]?.total ?? 0;
}
export function sumIncomeByApartmentMonth(apartmentId: string, year: number, month: number){
  const ym = `${year}-${String(month).padStart(2,'0')}`;
  const r = query<{total:number}>(`
    SELECT COALESCE(SUM(i.total),0) AS total
    FROM invoices i
    JOIN leases l ON l.id = i.lease_id
    JOIN rooms r ON r.id = l.room_id
    WHERE r.apartment_id = ? AND substr(i.period_start,1,7) = ?
  `, [apartmentId, ym]);
  return r[0]?.total ?? 0;
}
export function listMonthsWithActivity(apartmentId: string){
  const rowsInv = query<{ym:string}>(`
    SELECT DISTINCT substr(i.period_start,1,7) AS ym
    FROM invoices i
    JOIN leases l ON l.id = i.lease_id
    JOIN rooms r ON r.id = l.room_id
    WHERE r.apartment_id = ?
  `, [apartmentId]);
  const rowsOp = query<{ym:string}>(`
    SELECT DISTINCT printf('%04d-%02d', year, month) AS ym
    FROM operating_expenses
    WHERE apartment_id = ?
  `, [apartmentId]);
  const set = new Set<string>();
  rowsInv.forEach(x=> x.ym && set.add(x.ym));
  rowsOp.forEach(x=> x.ym && set.add(x.ym));
  return Array.from(set).sort((a,b)=> a<b?1:-1).map(ym=> ({ym, year: Number(ym.split('-')[0]), month: Number(ym.split('-')[1])}));
}
