import {exec, query} from '../db';
import { v4 as uuidv4 } from 'uuid';
import {scheduleReminder} from './notifications';

type LeaseType = 'short_term' | 'long_term';
type Billing = 'daily' | 'monthly' | 'yearly';
export type FixedOrVariable = 'fixed' | 'variable';

export type LeaseConfig = {
  roomId: string;
  leaseType: LeaseType;
  billing: Billing;
  startDateISO: string;
  baseRent: number;
  deposit?: number;
  durationDays?: number;
  isAllInclusive: boolean;
  endDateISO?: string;
  charges?: Array<{ name: string; type: FixedOrVariable; unit?: string|null; unitPrice?: number|null }>;
  tenant?: { full_name: string; phone?: string; id_number?: string; note?: string };
};

export function createApartment(name: string, address?: string) {
  const id = uuidv4();
  exec(`INSERT INTO apartments (id, name, address) VALUES (?,?,?)`, [id, name, address ?? null]);
  return id;
}
export function deleteApartment(apartmentId: string) {
  const rooms = query<{c: number}>(`SELECT COUNT(*) AS c FROM rooms WHERE apartment_id = ?`, [apartmentId])[0]?.c ?? 0;
  if (rooms > 0) throw new Error('Căn hộ còn phòng, không thể xoá. Hãy xoá/chuyển hết phòng trước.');
  exec(`DELETE FROM apartments WHERE id = ?`, [apartmentId]);
}

export function createRoom(apartmentId: string, code: string, floor?: number, area?: number) {
  const id = uuidv4();
  exec(`INSERT INTO rooms (id, apartment_id, code, floor, area, status) VALUES (?,?,?,?,?,?)`, [id, apartmentId, code, floor ?? null, area ?? null, 'available']);
  return id;
}
export function deleteRoom(roomId: string) {
  const leases = query<{c: number}>(`SELECT COUNT(*) AS c FROM leases WHERE room_id = ? AND status = 'active'`, [roomId])[0]?.c ?? 0;
  if (leases > 0) throw new Error('Phòng còn hợp đồng, không thể xoá.');
  exec(`DELETE FROM rooms WHERE id = ?`, [roomId]);
}

export function createTenant(full_name: string, phone?: string, id_number?: string, note?: string) {
  const id = uuidv4();
  exec(`INSERT INTO tenants (id, full_name, phone, id_number, note) VALUES (?,?,?,?,?)`, [id, full_name, phone ?? null, id_number ?? null, note ?? null]);
  return id;
}
export function listTenants() { return query(`SELECT * FROM tenants ORDER BY created_at DESC`); }
export function getTenant(id: string) { return query(`SELECT * FROM tenants WHERE id = ?`, [id])[0]; }

export function startLeaseAdvanced(cfg: LeaseConfig) {
  const id = uuidv4();
  const {roomId, leaseType, billing, startDateISO, baseRent, deposit=0, durationDays, isAllInclusive, endDateISO, tenant} = cfg;
  const billing_cycle: Billing = leaseType === 'short_term' ? 'daily' : billing;
  let tenantId: string | null = null;
  if (tenant?.full_name) tenantId = createTenant(tenant.full_name, tenant.phone, tenant.id_number, tenant.note);

  exec(`INSERT INTO leases (id, room_id, lease_type, start_date, billing_cycle, base_rent, deposit_amount, duration_days, is_all_inclusive, end_date, status, tenant_id)
        VALUES (?,?,?,?,?,?,?,?,?,?, 'active', ?)`,
      [id, roomId, leaseType, startDateISO, billing_cycle, baseRent, deposit, durationDays ?? null, isAllInclusive ? 1 : 0, endDateISO ?? null, tenantId]);
  exec(`UPDATE rooms SET status = ? WHERE id = ?`, ['occupied', roomId]);

  if (!isAllInclusive && (cfg.charges?.length ?? 0) > 0) {
    for (const ch of cfg.charges!) {
if (ch.type === 'fixed') {
  const ctId = upsertChargeType(ch.name, ch.unit ?? 'tháng', 'flat', ch.unitPrice ?? 0, false);
  addRecurringCharge(id, ctId, ch.unitPrice ?? 0, 0);
} else {
  // variable (Điện/Nước): unitPrice + meterStart
  const ctId = upsertChargeType(ch.name, ch.unit ?? undefined, 'per_unit', ch.unitPrice ?? 0, true);
  addRecurringCharge(id, ctId, ch.unitPrice ?? 0, 1, {meterStart: ch.meterStart ?? 0});
}
    }
  } else {
    const ctId = upsertChargeType('Gói bao phí', 'kỳ', 'flat', baseRent);
    addRecurringCharge(id, ctId, baseRent, 0);
  }

  ensureCycles(id);
  scheduleRemindersForLease(id);
  return id;
}

export function ensureCycles(leaseId: string) {
  const lease = query<any>(`SELECT * FROM leases WHERE id = ?`, [leaseId])[0];
  if (!lease) return;
  const existing = query<{c:number}>(`SELECT COUNT(*) c FROM lease_cycles WHERE lease_id = ?`, [leaseId])[0]?.c ?? 0;
  if (existing > 0) return;

  const start = new Date(lease.start_date);
  const end = lease.end_date ? new Date(lease.end_date) : null;

  function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth()+n); return x; }
  function addYears(d: Date, n: number)  { const x = new Date(d); x.setFullYear(x.getFullYear()+n); return x; }
  function addDays(d: Date, n: number)   { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
  function fmt(date: Date) { return date.toISOString().slice(0,10); }

  let periods: Array<{s:Date,e:Date}> = [];

  if (lease.lease_type === 'short_term') {
    const dur = lease.duration_days ?? 1;
    const s = start;
    const e = addDays(start, dur-1);
    periods.push({s, e});
  } else {
    let cursor = start;
    for (let i=0;i<36;i++) {
      let next: Date;
      if (lease.billing_cycle === 'yearly') next = addYears(cursor, 1)
      else next = addMonths(cursor, 1);
      const periodEnd = addDays(next, -1);
      if (end && periodEnd > end) { periods.push({s: cursor, e: end}); break; }
      periods.push({s: cursor, e: periodEnd});
      cursor = next;
      if (end && cursor > end) break;
    }
  }

  for (const p of periods) {
    const id = uuidv4();
    const due = p.e;
    exec(`INSERT INTO lease_cycles (id, lease_id, period_start, period_end, due_date, status) VALUES (?,?,?,?,?, 'open')`, [id, leaseId, fmt(p.s), fmt(p.e), fmt(due)]);
  }
}

export function scheduleRemindersForLease(leaseId: string) {
  const cycles = listCycles(leaseId).filter((c:any)=> c.status !== 'settled');
  for (const c of cycles) {
    const d = new Date(c.due_date); d.setDate(d.getDate() - 1);
    const pre = d.toISOString().slice(0,10);
    scheduleReminder(`rem_${c.id}`, 'Nhắc thanh toán', `Kỳ ${c.period_start} → ${c.period_end} sắp đến hạn`, pre);
  }
}

export function closeExpiredLeases() {
  const today = new Date().toISOString().slice(0,10);
  const leases = query<any>(`SELECT * FROM leases WHERE status = 'active' AND end_date IS NOT NULL AND end_date <= ?`, [today]);
  for (const l of leases) {
    const open = query<{c:number}>(`SELECT COUNT(*) c FROM lease_cycles WHERE lease_id = ? AND status <> 'settled'`, [l.id])[0]?.c ?? 0;
    if (open === 0) {
      exec(`UPDATE leases SET status = 'ended' WHERE id = ?`, [l.id]);
      exec(`UPDATE rooms SET status = 'available' WHERE id = (SELECT room_id FROM leases WHERE id = ?)`, [l.id]);
    }
  }
}

export function createOrGetInvoiceForCycle(cycleId: string) {
  const cyc = getCycle(cycleId);
  if (!cyc) throw new Error('Cycle not found');
  if (cyc.invoice_id) return query(`SELECT * FROM invoices WHERE id = ?`, [cyc.invoice_id])[0];

  const lease = query<any>(`SELECT * FROM leases WHERE id = ?`, [cyc.lease_id])[0];
  const id = uuidv4();
  const now = new Date().toISOString();
  const recs = query<any>(`SELECT rc.*, ct.name, ct.unit FROM recurring_charges rc JOIN charge_types ct ON ct.id = rc.charge_type_id WHERE rc.lease_id = ?`, [lease.id]);

  let subtotal = 0;
  exec(`INSERT INTO invoices (id, lease_id, period_start, period_end, issue_date, subtotal, total, status) VALUES (?,?,?,?,?,?,?, 'sent')`,
      [id, lease.id, cyc.period_start, cyc.period_end, now, 0, 0]);

  // tự add phí cố định
  for (const r of recs) {
    if (r.is_variable == 1) continue;
    const amount = r.unit_price ?? 0;
    subtotal += amount;
    const itId = uuidv4();
    exec(`INSERT INTO invoice_items (id, invoice_id, description, quantity, unit, unit_price, amount, charge_type_id) VALUES (?,?,?,?,?,?,?,?)`,
        [itId, id, r.name, 1, r.unit ?? null, r.unit_price ?? 0, amount, r.charge_type_id]);
  }

  exec(`UPDATE invoices SET subtotal = ?, total = ? WHERE id = ?`, [subtotal, subtotal, id]);
  exec(`UPDATE lease_cycles SET invoice_id = ? WHERE id = ?`, [id, cycleId]);
  return query(`SELECT * FROM invoices WHERE id = ?`, [id])[0];
}
// Tạo/cập nhật hóa đơn NHÁP cho 1 chu kỳ (không chốt kỳ, không tạo kỳ mới)
export function draftInvoiceForCycle(
  cycleId: string,
  variableInputs: Array<{charge_type_id: string; quantity: number; unit_price?: number}> = [],
  extraCosts: Array<{name: string; amount: number}> = []
) {
  const c = getCycle(cycleId);
  if (!c) throw new Error('Cycle not found');

  // mở hoặc tạo invoice (status 'open')
  const inv = openInvoiceForCycle(cycleId);
  // clear items cũ để tránh cộng dồn
  exec(`DELETE FROM invoice_items WHERE invoice_id = ?`, [inv.id]);

  // lấy danh sách phí của hợp đồng
  const charges = listChargesByLease(inv.lease_id);

  // 1) Phí cố định: add theo unit_price hiện tại
  for (const ch of charges) {
    if (Number(ch.is_variable) === 1) continue;
    const qty = 1;
    const price = Number(ch.unit_price) || 0;
    // dùng addInvoiceItem nội bộ
    const id = uuidv4();
    exec(`INSERT INTO invoice_items (id, invoice_id, description, quantity, unit, unit_price, amount, charge_type_id, meta_json)
           VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, inv.id, ch.name, qty, ch.unit, price, qty*price, ch.charge_type_id, JSON.stringify({draft:true})]);
  }

  // 2) Phí biến đổi từ input
  for (const inp of variableInputs) {
    const ch = charges.find((x:any)=> x.charge_type_id === inp.charge_type_id);
    if (!ch) continue;
    const qty = Math.max(0, inp.quantity || 0);
    const price = (typeof inp.unit_price === 'number') ? inp.unit_price : (Number(ch.unit_price)||0);
    const id = uuidv4();
    exec(`INSERT INTO invoice_items (id, invoice_id, description, quantity, unit, unit_price, amount, charge_type_id, meta_json)
           VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, inv.id, ch.name, qty, ch.unit, price, qty*price, ch.charge_type_id, JSON.stringify({draft:true, variable:true})]);
  }

  // 3) Phụ phí phát sinh
  for (const ex of extraCosts) {
    const id = uuidv4();
    exec(`INSERT INTO invoice_items (id, invoice_id, description, quantity, unit, unit_price, amount, charge_type_id, meta_json)
           VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, inv.id, ex.name, 1, null, ex.amount, ex.amount, null, JSON.stringify({draft:true, extra:true})]);
  }

  // 4) cập nhật tổng, giữ status = 'open'
  const sum = query<{sum:number}>(`SELECT SUM(amount) sum FROM invoice_items WHERE invoice_id = ?`, [inv.id])[0]?.sum ?? 0;
  exec(`UPDATE invoices SET subtotal = ?, total = ?, status = 'open' WHERE id = ?`, [sum, sum, inv.id]);

  return query(`SELECT * FROM invoices WHERE id = ?`, [inv.id])[0];
}


export function getVariableCharges(leaseId: string) {
  return query<any>(`SELECT rc.*, ct.name, ct.unit FROM recurring_charges rc JOIN charge_types ct ON ct.id = rc.charge_type_id WHERE rc.lease_id = ? AND rc.is_variable = 1`, [leaseId]);
}

export function finalizeCyclePayment(
  cycleId: string,
  variableInputs: Array<{charge_type_id:string, amount:number}>,
  extras: Array<{description:string, amount:number}>,
  method: string = 'cash'
) {
  const inv = createOrGetInvoiceForCycle(cycleId);

  // Thêm các khoản biến đổi (ở đây amount là tổng tiền -> quantity=1, unit_price=amount)
  for (const v of variableInputs) {
    const info = query<any>(`SELECT ct.name, ct.unit FROM charge_types ct WHERE ct.id = ?`, [v.charge_type_id])[0];
    addInvoiceItem(inv.id, info?.name ?? 'Khoản phí', 1, info?.unit ?? undefined, v.amount, v.amount, v.charge_type_id);
  }

  // Phí phát sinh thêm
  for (const ex of extras) addInvoiceItem(inv.id, ex.description, 1, undefined, ex.amount, ex.amount, undefined);

  const total = getInvoice(inv.id).total;
  recordPayment(inv.id, total, method);
  exec(`UPDATE lease_cycles SET status = 'settled' WHERE id = ?`, [cycleId]);
}

export function getCharges(leaseId: string) {
  return query<any>(`SELECT rc.*, ct.name FROM recurring_charges rc JOIN charge_types ct ON ct.id = rc.charge_type_id WHERE rc.lease_id = ?`, [leaseId]);
}

// ==== CHARGE CATALOG (danh mục phí mặc định) ====
export type ChargeCatalogItem = {
  name: string;
  unit?: string;                 // 'tháng', 'kWh', 'm3', ...
  is_variable: boolean;          // true = không cố định -> nhập khi thanh toán
  default_price?: number;        // cho phí cố định (flat) hoặc gợi ý
};

const DEFAULT_CATALOG: ChargeCatalogItem[] = [
  {name: 'Tiền phòng', unit: 'tháng', is_variable: false, default_price: 0},
  {name: 'Điện', unit: 'kWh', is_variable: true},
  {name: 'Nước', unit: 'm3', is_variable: true},
  {name: 'Rác', unit: 'tháng', is_variable: false, default_price: 30000},
  {name: 'Internet', unit: 'tháng', is_variable: false, default_price: 120000},
  {name: 'Gửi xe', unit: 'tháng', is_variable: false},
];

export function upsertChargeType(
  name: string,
  unit?: string,
  pricing_model: 'flat'|'per_unit'='flat',
  unit_price?: number,
  is_variable = false
) {
  const found = query<{id:string}>(`SELECT id FROM charge_types WHERE name = ? LIMIT 1`, [name])[0];
  if (found) {
    exec(`UPDATE charge_types SET unit = ?, pricing_model = ?, unit_price = ?, meta_json = ? WHERE id = ?`,
      [unit||null, pricing_model, unit_price ?? null, JSON.stringify({is_variable}), found.id]);
    return found.id;
  }
  const id = uuidv4();
  exec(`INSERT INTO charge_types (id,name,unit,pricing_model,unit_price,meta_json) VALUES (?,?,?,?,?,?)`,
      [id, name, unit||null, pricing_model, unit_price ?? null, JSON.stringify({is_variable})]);
  return id;
}

// Tạo danh mục chuẩn (nếu chưa có)
export function ensureDefaultCharges() {
  for (const it of DEFAULT_CATALOG) {
    upsertChargeType(
      it.name,
      it.unit,
      it.is_variable ? 'per_unit' : 'flat',
      it.default_price,
      it.is_variable
    );
  }
}

export function addCustomChargeType(name: string, isVariable: boolean, unit?: string, defaultPrice?: number) {
  return upsertChargeType(name, unit, isVariable ? 'per_unit' : 'flat', defaultPrice, isVariable);
}

export function getChargeType(id: string) {
  return query(`SELECT * FROM charge_types WHERE id = ?`, [id])[0];
}

export function listChargeTypes() {
  return query(`SELECT * FROM charge_types ORDER BY name ASC`);
}

// ==== LEASE & ROOM ====
export function getRoom(roomId: string) {
  return query(`SELECT * FROM rooms WHERE id = ?`, [roomId])[0];
}
export function getLeaseByRoom(roomId: string) {
  return query(`SELECT * FROM leases WHERE room_id = ? AND status = 'active' LIMIT 1`, [roomId])[0];
}
export function getLease(leaseId: string) {
  return query(`SELECT * FROM leases WHERE id = ?`, [leaseId])[0];
}

export function startLease(
  roomId: string,
  leaseType: 'short_term'|'long_term',
  startDate: string,
  billingCycle: 'daily'|'monthly'|'yearly',
  baseRent: number,
  depositAmount = 0,
  durationDays?: number,          // cho short_term
  isAllInclusive = false,         // bao phí
  allInclusiveAmount?: number     // tổng tiền trọn gói (nếu bao phí)
) {
  const id = uuidv4();
  exec(`UPDATE rooms SET status = 'occupied' WHERE id = ?`, [roomId]);

  exec(`INSERT INTO leases
    (id, room_id, lease_type, start_date, billing_cycle, base_rent, deposit_amount, duration_days, is_all_inclusive, status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, roomId, leaseType, startDate, billingCycle, baseRent, depositAmount, durationDays ?? null, isAllInclusive ? 1 : 0, 'active']
  );

  if (isAllInclusive) {
    const ctId = upsertChargeType('Trọn gói', billingCycle === 'daily' ? 'ngày' : (billingCycle === 'monthly' ? 'tháng' : 'năm'), 'flat', allInclusiveAmount ?? baseRent, false);
    addRecurringCharge(id, ctId, allInclusiveAmount ?? baseRent, 0);
  }

  createFirstCycle(id, startDate, billingCycle, durationDays);
  return id;
}

// cũ:
// export function addRecurringCharge(leaseId: string, chargeTypeId: string, unit_price?: number, is_variable?: number) {

export function addRecurringCharge(
  leaseId: string,
  chargeTypeId: string,
  unit_price?: number,
  is_variable?: number,
  config?: any,                 // <-- thêm
) {
  const id = uuidv4();
  const ct = getChargeType(chargeTypeId);
  const _isVariable = typeof is_variable === 'number'
    ? is_variable
    : (ct?.meta_json ? (JSON.parse(ct.meta_json).is_variable ? 1 : 0) : 0);

  exec(
    `INSERT INTO recurring_charges
      (id, lease_id, charge_type_id, unit_price, is_variable, config_json)
     VALUES (?,?,?,?,?,?)`,
    [id, leaseId, chargeTypeId,
     unit_price ?? ct?.unit_price ?? 0,
     _isVariable,
     config ? JSON.stringify(config) : null]   // <-- lưu meterStart
  );
  return id;
}


// ==== CYCLES ====
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function addYears(d: Date, n: number) { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; }
function toYMD(d: Date) { return d.toISOString().slice(0,10); }

function createFirstCycle(leaseId: string, startDate: string, billing: 'daily'|'monthly'|'yearly', durationDays?: number) {
  const s = new Date(startDate);
  let e: Date;
  if (billing === 'daily') e = addDays(s, Math.max(1, durationDays ?? 1));
  else if (billing === 'monthly') e = addMonths(s, 1);
  else e = addYears(s, 1);

  const due = addDays(e, 0);
  const id = uuidv4();
  exec(`INSERT INTO lease_cycles (id, lease_id, period_start, period_end, due_date, status) VALUES (?,?,?,?,?,?)`,
    [id, leaseId, toYMD(s), toYMD(e), toYMD(due), 'open']);
  return id;
}

export function listCycles(leaseId: string) {
  return query(`SELECT * FROM lease_cycles WHERE lease_id = ? ORDER BY period_start ASC`, [leaseId]);
}

export function getCycle(cycleId: string) {
  return query(`SELECT * FROM lease_cycles WHERE id = ?`, [cycleId])[0];
}

export function openInvoiceForCycle(cycleId: string) {
  const c = getCycle(cycleId);
  if (!c) throw new Error('Cycle not found');
  if (c.invoice_id) return query(`SELECT * FROM invoices WHERE id = ?`, [c.invoice_id])[0];

  const id = uuidv4();
  exec(`INSERT INTO invoices (id, lease_id, period_start, period_end, issue_date, subtotal, total, status)
        SELECT ?, lease_id, period_start, period_end, date('now'), 0, 0, 'open' FROM lease_cycles WHERE id = ?`,
        [id, cycleId]);
  exec(`UPDATE lease_cycles SET invoice_id = ? WHERE id = ?`, [id, cycleId]);
  return query(`SELECT * FROM invoices WHERE id = ?`, [id])[0];
}

export function getInvoice(id: string) {
  return query(`SELECT * FROM invoices WHERE id = ?`, [id])[0];
}

export function getInvoiceItems(invoiceId: string) {
  return query(`SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY rowid ASC`, [invoiceId]);
}

function addInvoiceItem(
  invoiceId: string,
  description: string,
  quantity: number,
  unit: string|undefined,
  unit_price: number,
  amount: number,
  chargeTypeId?: string,
  meta?: any
) {
  const id = uuidv4();
  exec(`INSERT INTO invoice_items (id, invoice_id, description, quantity, unit, unit_price, amount, charge_type_id, meta_json)
        VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, invoiceId, description, quantity, unit ?? null, unit_price, amount, chargeTypeId ?? null, meta ? JSON.stringify(meta) : null]);
}

function recalcInvoice(invoiceId: string) {
  const sum = query<{sum:number}>(`SELECT SUM(amount) as sum FROM invoice_items WHERE invoice_id = ?`, [invoiceId])[0]?.sum ?? 0;
  exec(`UPDATE invoices SET subtotal = ?, total = ?, status = CASE WHEN total>0 THEN status ELSE 'open' END WHERE id = ?`, [sum, sum, invoiceId]);
}

export function listChargesByLease(leaseId: string) {
  return query(`
    SELECT rc.id, rc.lease_id, rc.charge_type_id, rc.unit_price, rc.is_variable,
           ct.name, ct.unit, ct.pricing_model
    FROM recurring_charges rc
    JOIN charge_types ct ON ct.id = rc.charge_type_id
    WHERE rc.lease_id = ?
    ORDER BY ct.name ASC
  `, [leaseId]);
}

// Tính & chốt kỳ
export function settleCycleWithInputs(
  cycleId: string,
  variableInputs: Array<{charge_type_id: string; quantity: number; unit_price?: number}>,
  extraCosts: Array<{name: string; amount: number}>=[]
) {
  const c = getCycle(cycleId);
  if (!c) throw new Error('Cycle not found');

  const inv = openInvoiceForCycle(cycleId);
  const charges = listChargesByLease(inv.lease_id);

  // 1) Cố định
  for (const ch of charges) {
    if (Number(ch.is_variable) === 1) continue;
    const qty = 1;
    const price = Number(ch.unit_price) || 0;
    addInvoiceItem(inv.id, ch.name, qty, ch.unit, price, qty*price, ch.charge_type_id);
  }

  // 2) Biến đổi
  for (const inp of variableInputs) {
    const ch = charges.find((x:any)=> x.charge_type_id === inp.charge_type_id);
    if (!ch) continue;
    const qty = Math.max(0, inp.quantity || 0);
    const price = (typeof inp.unit_price === 'number') ? inp.unit_price : (Number(ch.unit_price)||0);
    addInvoiceItem(inv.id, ch.name, qty, ch.unit, price, qty*price, ch.charge_type_id, {variable: true});
  }

  // 3) Phát sinh
  for (const ex of extraCosts) {
    addInvoiceItem(inv.id, ex.name, 1, undefined, ex.amount, ex.amount, undefined, {extra: true});
  }

  // 4) Tổng
  recalcInvoice(inv.id);

  // 5) Chốt
  exec(`UPDATE lease_cycles SET status = 'settled' WHERE id = ?`, [cycleId]);

  // 6) Kỳ kế tiếp
  const lease = getLease(inv.lease_id);
  if (lease?.status === 'active') {
    const end = new Date(c.period_end);
    let nextStart = end;
    nextStart = addDays(end, 0);
    createNextCycle(inv.lease_id, toYMD(nextStart), lease.billing_cycle);
  }

  return getInvoice(inv.id);
}

function createNextCycle(leaseId: string, startDate: string, billing: 'daily'|'monthly'|'yearly') {
  const s = new Date(startDate);
  let e: Date;
  if (billing === 'daily') e = addDays(s, 1);
  else if (billing === 'monthly') e = addMonths(s, 1);
  else e = addYears(s, 1);
  const due = addDays(e, 0);
  const id = uuidv4();
  exec(`INSERT INTO lease_cycles (id, lease_id, period_start, period_end, due_date, status) VALUES (?,?,?,?,?,?)`,
    [id, leaseId, toYMD(s), toYMD(e), toYMD(due), 'open']);
  return id;
}

export function recordPayment(invoiceId: string, amount: number, method: string) {
  const id = uuidv4();
  exec(`INSERT INTO payments (id, invoice_id, payment_date, amount, method) VALUES (?,?,?,?,?)`,
    [id, invoiceId, toYMD(new Date()), amount, method]);
  const inv = getInvoice(invoiceId);
  const paid = query<{sum:number}>(`SELECT SUM(amount) sum FROM payments WHERE invoice_id = ?`, [invoiceId])[0]?.sum ?? 0;
  const status = paid >= inv.total ? 'paid' : 'partial';
  exec(`UPDATE invoices SET status = ? WHERE id = ?`, [status, invoiceId]);
}

// ==== NEXT DUE & REMINDER ====
export function nextDueDate(leaseId: string) {
  return query<{due_date: string}>(`SELECT due_date FROM lease_cycles WHERE lease_id = ? AND status != 'settled' ORDER BY due_date ASC LIMIT 1`, [leaseId])[0]?.due_date;
}

// ==== END LEASE EARLY ====
export function hasUnpaidCycles(leaseId: string) {
  const rows = query<{cnt:number}>(`
    SELECT COUNT(*) cnt
    FROM lease_cycles c
    LEFT JOIN invoices i ON i.id = c.invoice_id
    WHERE c.lease_id = ? AND (c.status != 'settled' OR (i.status IS NOT NULL AND i.status != 'paid'))
  `, [leaseId]);
  return (rows[0]?.cnt ?? 0) > 0;
}

export function endLeaseEarly(leaseId: string, endDate: string) {
  if (hasUnpaidCycles(leaseId)) {
    throw new Error('Còn kỳ chưa thanh toán, vui lòng thanh toán hết trước khi kết thúc.');
  }
  exec(`UPDATE leases SET status = 'ended', end_date = ? WHERE id = ?`, [endDate, leaseId]);
  const lease = getLease(leaseId);
  if (lease?.room_id) exec(`UPDATE rooms SET status = 'available' WHERE id = ?`, [lease.room_id]);
}

// gọi 1 lần khi app khởi tạo
export function seedChargeCatalogOnce() {
  ensureDefaultCharges();
}
export function updateLeaseEndDate(leaseId: string, endDateISO: string) {
  exec(`UPDATE leases SET end_date = ? WHERE id = ?`, [endDateISO, leaseId]);
}
export function updateRecurringChargePrice(leaseId: string, chargeTypeId: string, newPrice: number) {
  exec(`UPDATE recurring_charges SET unit_price = ? WHERE lease_id = ? AND charge_type_id = ?`,
    [newPrice, leaseId, chargeTypeId]);
}

// Lấy danh sách phí của hợp đồng (kèm tên & loại)
export function listChargesForLease(leaseId: string) {
  return query<any>(`
    SELECT rc.charge_type_id, rc.unit_price, rc.is_variable,
           ct.name, ct.unit, ct.pricing_model
    FROM recurring_charges rc
    JOIN charge_types ct ON ct.id = rc.charge_type_id
    WHERE rc.lease_id = ?
    ORDER BY CASE WHEN ct.name='Tiền phòng' THEN 0 ELSE 1 END, ct.name
  `, [leaseId]);
}
export function updateRecurringChargeConfig(leaseId: string, chargeTypeId: string, partial: any) {
  const row = query<{config_json?: string}>(`
    SELECT config_json FROM recurring_charges
    WHERE lease_id = ? AND charge_type_id = ? LIMIT 1
  `, [leaseId, chargeTypeId])[0];

  let cfg: any = {};
  try { cfg = row?.config_json ? JSON.parse(row.config_json) : {}; } catch {}
  const merged = {...cfg, ...partial};
  exec(`UPDATE recurring_charges SET config_json = ? WHERE lease_id = ? AND charge_type_id = ?`,
      [JSON.stringify(merged), leaseId, chargeTypeId]);
}