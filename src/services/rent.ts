import {exec, query} from '../db';
import {v4 as uuid} from 'uuid';

type LeaseType = 'short_term' | 'long_term';
type Billing = 'daily' | 'monthly';

export function createApartment(name: string, address?: string) {
  const id = uuid();
  exec(`INSERT INTO apartments (id, name, address) VALUES (?,?,?)`, [id, name, address ?? null]);
  return id;
}

export function createRoom(apartmentId: string, code: string, floor?: number, area?: number) {
  const id = uuid();
  exec(`INSERT INTO rooms (id, apartment_id, code, floor, area, status) VALUES (?,?,?,?,?,?)`, [id, apartmentId, code, floor ?? null, area ?? null, 'available']);
  return id;
}

export function startLease(roomId: string, leaseType: LeaseType, startDateISO: string, billing: Billing, baseRent: number, deposit = 0) {
  const id = uuid();
  exec(`INSERT INTO leases (id, room_id, lease_type, start_date, billing_cycle, base_rent, deposit_amount, status) VALUES (?,?,?,?,?,?,?, 'active')`, [id, roomId, leaseType, startDateISO, billing, baseRent, deposit]);
  exec(`UPDATE rooms SET status = ? WHERE id = ?`, ['occupied', roomId]);
  return id;
}

export function upsertChargeType(name: string, unit: string|null, pricing: 'flat'|'per_unit'|'tiered', unitPrice?: number|null, metaJson?: object) {
  const id = uuid();
  exec(`INSERT INTO charge_types (id, name, unit, pricing_model, unit_price, meta_json) VALUES (?,?,?,?,?,?)`, [id, name, unit, pricing, unitPrice ?? null, metaJson ? JSON.stringify(metaJson) : null]);
  return id;
}

export function addRecurringCharge(leaseId: string, chargeTypeId: string, unitPrice?: number|null, config?: object) {
  const id = uuid();
  exec(`INSERT INTO recurring_charges (id, lease_id, charge_type_id, unit_price, config_json) VALUES (?,?,?,?,?)`, [id, leaseId, chargeTypeId, unitPrice ?? null, config ? JSON.stringify(config) : null]);
  return id;
}

export function addMeterReading(leaseId: string, chargeTypeId: string, periodStartISO: string, periodEndISO: string, startReading: number, endReading: number) {
  const id = uuid();
  exec(`INSERT INTO meter_readings (id, lease_id, charge_type_id, period_start, period_end, start_reading, end_reading) VALUES (?,?,?,?,?,?,?)`, [id, leaseId, chargeTypeId, periodStartISO, periodEndISO, startReading, endReading]);
  return id;
}

export function generateInvoice(leaseId: string, periodStartISO: string, periodEndISO: string) {
  const id = uuid();
  const lease = query<{base_rent:number, billing_cycle:'daily'|'monthly'}>(`SELECT base_rent, billing_cycle FROM leases WHERE id = ?`, [leaseId])[0];
  const items: Array<{desc:string; qty:number; unit:string|null; unit_price:number; amount:number; charge_type_id?:string|null}> = [];
  items.push({ desc: lease.billing_cycle === 'monthly' ? 'Tiền phòng' : 'Tiền phòng (theo ngày)', qty: 1, unit: lease.billing_cycle === 'monthly' ? 'tháng' : 'kỳ', unit_price: lease.base_rent, amount: lease.base_rent });
  const meterRows = query<{charge_type_id:string, start_reading:number, end_reading:number, name:string, unit:string|null, unit_price:number|null, pricing_model:string}>(
    `SELECT mr.charge_type_id, mr.start_reading, mr.end_reading, ct.name, ct.unit, ct.unit_price, ct.pricing_model
     FROM meter_readings mr JOIN charge_types ct ON ct.id = mr.charge_type_id
     WHERE mr.lease_id = ? AND mr.period_start >= ? AND mr.period_end <= ?`, [leaseId, periodStartISO, periodEndISO]
  );
  for (const m of meterRows) {
    const qty = Math.max(0, m.end_reading - m.start_reading);
    const unitPrice = m.unit_price ?? 0;
    const amount = m.pricing_model === 'per_unit' ? Math.round(qty * unitPrice) : (m.unit_price ?? 0);
    items.push({ desc: `${m.name} (${qty}${m.unit ?? ''})`, qty, unit: m.unit, unit_price: unitPrice, amount, charge_type_id: m.charge_type_id });
  }
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const total = subtotal;
  const now = new Date().toISOString();
  exec(`INSERT INTO invoices (id, lease_id, period_start, period_end, issue_date, subtotal, total, status) VALUES (?,?,?,?,?,?,?, 'sent')`, [id, leaseId, periodStartISO, periodEndISO, now, subtotal, total]);
  for (const it of items) {
    const itemId = uuid();
    exec(`INSERT INTO invoice_items (id, invoice_id, description, quantity, unit, unit_price, amount, charge_type_id) VALUES (?,?,?,?,?,?,?,?)`, [itemId, id, it.desc, it.qty, it.unit, it.unit_price, it.amount, it.charge_type_id ?? null]);
  }
  return {invoiceId: id, total, items};
}

export function getInvoice(id: string) { return query(`SELECT * FROM invoices WHERE id = ?`, [id])[0]; }
export function getInvoiceItems(invoiceId: string) { return query(`SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY rowid ASC`, [invoiceId]); }

// Safe deletions with checks
export function deleteApartment(apartmentId: string) {
  const rooms = query<{c: number}>(`SELECT COUNT(*) AS c FROM rooms WHERE apartment_id = ?`, [apartmentId])[0]?.c ?? 0;
  if (rooms > 0) throw new Error('Căn hộ còn phòng, không thể xoá. Hãy xoá/chuyển hết phòng trước.');
  exec(`DELETE FROM apartments WHERE id = ?`, [apartmentId]);
}

export function deleteRoom(roomId: string) {
  const leases = query<{c: number}>(`SELECT COUNT(*) AS c FROM leases WHERE room_id = ?`, [roomId])[0]?.c ?? 0;
  if (leases > 0) throw new Error('Phòng còn hợp đồng, không thể xoá. Hãy kết thúc/xoá hợp đồng trước.');
  exec(`DELETE FROM rooms WHERE id = ?`, [roomId]);
}
