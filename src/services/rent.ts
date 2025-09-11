// src/services/rent.ts
import {exec, query} from '../db';
import {v4 as uuidv4} from 'uuid';

// ====== Kiểu ======
export type FixedOrVariable = 'fixed' | 'variable';

export type LeaseConfig = {
  roomId: string;
  leaseType: 'short_term' | 'long_term';
  billing: 'daily' | 'monthly' | 'yearly';
  startDateISO: string;
  baseRent: number;
  deposit?: number;
  durationDays?: number;
  isAllInclusive: boolean; // để tương thích, UI mới không dùng nữa
  endDateISO?: string;
  charges?: Array<{
    name: string;
    type: FixedOrVariable;
    unit?: string | null;
    unitPrice?: number | null;
    meterStart?: number;
  }>;
  tenant?: { full_name: string; phone?: string; id_number?: string; note?: string };
};

// ====== Helpers ======
function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
function addYears(d: Date, n: number) {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + n);
  return x;
}

// ====== Apartments / Rooms ======
export function createApartment(name: string, address?: string) {
  const id = uuidv4();
  exec(`INSERT INTO apartments (id, name, address) VALUES (?,?,?)`, [id, name, address ?? null]);
  return id;
}
export function deleteApartment(apartmentId: string) {
  const rooms = query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM rooms WHERE apartment_id = ?`,
    [apartmentId],
  )[0]?.c ?? 0;
  if (rooms > 0)
    throw new Error('Căn hộ còn phòng, không thể xoá. Hãy xoá/chuyển hết phòng trước.');
  exec(`DELETE FROM apartments WHERE id = ?`, [apartmentId]);
}

export function createRoom(apartmentId: string, code: string, floor?: number, area?: number) {
  const id = uuidv4();
  exec(
    `INSERT INTO rooms (id, apartment_id, code, floor, area, status) VALUES (?,?,?,?,?,?)`,
    [id, apartmentId, code, floor ?? null, area ?? null, 'available'],
  );
  return id;
}
export function deleteRoom(roomId: string) {
  const leases =
    query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM leases WHERE room_id = ? AND status = 'active'`,
      [roomId],
    )[0]?.c ?? 0;
  if (leases > 0) throw new Error('Phòng còn hợp đồng, không thể xoá.');
  exec(`DELETE FROM rooms WHERE id = ?`, [roomId]);
}

export function getRoom(roomId: string) {
  return query(`SELECT * FROM rooms WHERE id = ?`, [roomId])[0];
}

// ====== Tenant ======
export function createTenant(full_name: string, phone?: string, id_number?: string, note?: string) {
  const id = uuidv4();
  exec(
    `INSERT INTO tenants (id, full_name, phone, id_number, note) VALUES (?,?,?,?,?)`,
    [id, full_name, phone ?? null, id_number ?? null, note ?? null],
  );
  return id;
}
export function listTenants() {
  return query(`SELECT * FROM tenants ORDER BY created_at DESC`);
}
export function getTenant(id: string) {
  return query(`SELECT * FROM tenants WHERE id = ?`, [id])[0];
}

// ====== Charge Types & Recurring ======
export function upsertChargeType(
  name: string,
  unit?: string,
  pricing_model: 'flat' | 'per_unit' = 'flat',
  unit_price?: number,
  is_variable = false,
) {
  const found = query<{ id: string }>(
    `SELECT id FROM charge_types WHERE name = ? LIMIT 1`,
    [name],
  )[0];
  if (found) {
    exec(
      `UPDATE charge_types SET unit = ?, pricing_model = ?, unit_price = ?, meta_json = ? WHERE id = ?`,
      [unit || null, pricing_model, unit_price ?? null, JSON.stringify({ is_variable }), found.id],
    );
    return found.id;
  }
  const id = uuidv4();
  exec(
    `INSERT INTO charge_types (id,name,unit,pricing_model,unit_price,meta_json) VALUES (?,?,?,?,?,?)`,
    [id, name, unit || null, pricing_model, unit_price ?? null, JSON.stringify({ is_variable })],
  );
  return id;
}
export function addCustomChargeType(
  name: string,
  isVariable: boolean,
  unit?: string,
  defaultPrice?: number,
) {
  return upsertChargeType(name, unit, isVariable ? 'per_unit' : 'flat', defaultPrice, isVariable);
}
export function getChargeType(id: string) {
  return query(`SELECT * FROM charge_types WHERE id = ?`, [id])[0];
}
export function listChargeTypes() {
  return query(`SELECT * FROM charge_types ORDER BY name ASC`);
}

// recurring_charges: lưu config_json để giữ meter_start cho phí biến đổi
export function addRecurringCharge(
  leaseId: string,
  chargeTypeId: string,
  unit_price?: number,
  is_variable?: number,
  config?: any
) {
  const id = uuidv4();
  const ct = getChargeType(chargeTypeId) || {};
  const _isVariable = typeof is_variable === 'number'
    ? is_variable
    : (ct?.meta_json ? (JSON.parse(ct.meta_json).is_variable ? 1 : 0) : 0);

  // 🛠 normalize key: meter_start (accept legacy meterStart)
  let normalizedCfg: any = null;
  if (config && typeof config === 'object') {
    const start =
      typeof config.meter_start === 'number'
        ? config.meter_start
        : typeof config.meterStart === 'number'
          ? config.meterStart
          : undefined;
    normalizedCfg = start != null ? { meter_start: Number(start) } : {};
  }

  exec(
    `INSERT INTO recurring_charges (id, lease_id, charge_type_id, unit_price, is_variable, config_json)
     VALUES (?,?,?,?,?,?)`,
    [id, leaseId, chargeTypeId, unit_price ?? ct?.unit_price ?? 0, _isVariable,
     normalizedCfg ? JSON.stringify(normalizedCfg) : null]
  );
  return id;
}

// Thêm nhiều phí custom 1 lần
export function addCustomRecurringCharges(
  leaseId: string,
  items: Array<{ name: string; isVariable: boolean; unit?: string; price: number; meterStart?: number }>,
) {
  for (const it of items) {
    const ctId = addCustomChargeType(it.name, it.isVariable, it.unit, it.price);
    addRecurringCharge(
      leaseId,
      ctId,
      it.price,
      it.isVariable ? 1 : 0,
      it.isVariable ? { meter_start: it.meterStart ?? 0 } : null,
    );
  }
}

// ====== Lease ======
export function startLeaseAdvanced(cfg: LeaseConfig) {
  const id = uuidv4();
  const {
    roomId,
    leaseType,
    billing,
    startDateISO,
    baseRent,
    deposit = 0,
    durationDays,
    isAllInclusive,
    endDateISO,
    tenant,
  } = cfg;
  const billing_cycle = leaseType === 'short_term' ? 'daily' : billing;

  // tenant
  let tenantId: string | null = null;
  if (tenant?.full_name)
    tenantId = createTenant(tenant.full_name, tenant.phone, tenant.id_number, tenant.note);

  exec(
    `INSERT INTO leases (id, room_id, lease_type, start_date, billing_cycle, base_rent, deposit_amount, duration_days, is_all_inclusive, end_date, status, tenant_id)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'active', ?)`,
    [
      id,
      roomId,
      leaseType,
      startDateISO,
      billing_cycle,
      baseRent,
      deposit,
      durationDays ?? null,
      isAllInclusive ? 1 : 0,
      endDateISO ?? null,
      tenantId,
    ],
  );

  exec(`UPDATE rooms SET status = ? WHERE id = ?`, ['occupied', roomId]);

  // add charges (không tự tạo “gói bao phí”)
  if (cfg.charges?.length) {
    for (const ch of cfg.charges) {
      const ctId = upsertChargeType(
        ch.name,
        ch.unit ?? undefined,
        ch.type === 'variable' ? 'per_unit' : 'flat',
        ch.unitPrice ?? 0,
        ch.type === 'variable',
      );
      addRecurringCharge(
        id,
        ctId,
        ch.unitPrice ?? 0,
        ch.type === 'variable' ? 1 : 0,
        ch.type === 'variable' ? { meter_start: ch.meterStart ?? 0 } : null,
      );
    }
  }

  ensureCycles(id);
  return id;
}

export function getLeaseByRoom(roomId: string) {
  return query(`SELECT * FROM leases WHERE room_id = ? AND status = 'active' LIMIT 1`, [roomId])[0];
}
export function getLease(leaseId: string) {
  return query(`SELECT * FROM leases WHERE id = ?`, [leaseId])[0];
}
export function updateLeaseBaseRent(leaseId: string, newBase: number) {
  exec(`UPDATE leases SET base_rent = ? WHERE id = ?`, [newBase, leaseId]);
}

export function listChargesForLease(leaseId: string) {
  // trả về cả meter_start từ config_json
  const rows = query<any>(
    `
    SELECT rc.id, rc.lease_id, rc.charge_type_id, rc.unit_price, rc.is_variable, rc.config_json,
           ct.name, ct.unit, ct.pricing_model
      FROM recurring_charges rc
      JOIN charge_types ct ON ct.id = rc.charge_type_id
     WHERE rc.lease_id = ?
     ORDER BY ct.name ASC
  `,
    [leaseId],
  );
  return rows.map(r => {
    let meter_start = 0;
    try {
      const cfg = r.config_json ? JSON.parse(r.config_json) : null;
      if (cfg && typeof cfg.meter_start === 'number') meter_start = cfg.meter_start;
    } catch {}
    // Đồng bộ “Tiền phòng” = leases.base_rent (nếu có item tên như vậy)
    if (String(r.name).toLowerCase() === 'tiền phòng') {
      const lease = getLease(leaseId);
      return { ...r, unit_price: Number(lease?.base_rent || r.unit_price), meter_start };
    }
    return { ...r, meter_start };
  });
}

// ====== Cycles & Invoices ======
export function listCycles(leaseId: string) {
  return query(
    `SELECT * FROM lease_cycles WHERE lease_id = ? ORDER BY period_start ASC`,
    [leaseId],
  );
}
export function getCycle(cycleId: string) {
  return query(`SELECT * FROM lease_cycles WHERE id = ?`, [cycleId])[0];
}
export function nextDueDate(leaseId: string) {
  return query<{ due_date: string }>(
    `SELECT due_date FROM lease_cycles WHERE lease_id = ? AND status != 'settled' ORDER BY due_date ASC LIMIT 1`,
    [leaseId],
  )[0]?.due_date;
}
export function getInvoice(id: string) {
  return query(`SELECT * FROM invoices WHERE id = ?`, [id])[0];
}
export function getInvoiceItems(invoiceId: string) {
  return query(
    `SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY rowid ASC`,
    [invoiceId],
  );
}

export function ensureCycles(leaseId: string) {
  const lease = getLease(leaseId);
  if (!lease) return;
  const existing =
    query<{ c: number }>(`SELECT COUNT(*) c FROM lease_cycles WHERE lease_id = ?`, [leaseId])[0]?.c ??
    0;
  if (existing > 0) return;

  const start = new Date(lease.start_date);
  const end = lease.end_date ? new Date(lease.end_date) : null;

  const periods: Array<{ s: Date; e: Date }> = [];
  if (lease.lease_type === 'short_term') {
    const dur = lease.duration_days ?? 1;
    const s = start;
    const e = addDays(start, dur - 1);
    periods.push({ s, e });
  } else {
    let cursor = start;
    for (let i = 0; i < 36; i++) {
      let next: Date;
      if (lease.billing_cycle === 'yearly') next = addYears(cursor, 1);
      else next = addMonths(cursor, 1);
      const periodEnd = addDays(next, -1);
      if (end && periodEnd > end) {
        periods.push({ s: cursor, e: end });
        break;
      }
      periods.push({ s: cursor, e: periodEnd });
      cursor = next;
      if (end && cursor > end) break;
    }
  }

  for (const p of periods) {
    const id = uuidv4();
    const due = p.e;
    exec(
      `INSERT INTO lease_cycles (id, lease_id, period_start, period_end, due_date, status) VALUES (?,?,?,?,?, 'open')`,
      [id, leaseId, toYMD(p.s), toYMD(p.e), toYMD(due)],
    );
  }
}

function openInvoiceForCycle(cycleId: string) {
  const c = getCycle(cycleId);
  if (!c) throw new Error('Cycle not found');
  if (c.invoice_id) return getInvoice(c.invoice_id);

  const id = uuidv4();
  exec(
    `INSERT INTO invoices (id, lease_id, period_start, period_end, issue_date, subtotal, total, status)
     SELECT ?, lease_id, period_start, period_end, date('now'), 0, 0, 'open' FROM lease_cycles WHERE id = ?`,
    [id, cycleId],
  );
  exec(`UPDATE lease_cycles SET invoice_id = ? WHERE id = ?`, [id, cycleId]);
  return getInvoice(id);
}

function addInvoiceItem(
  invoiceId: string,
  description: string,
  quantity: number,
  unit: string | undefined,
  unit_price: number,
  amount: number,
  chargeTypeId?: string,
  meta?: any,
) {
  const id = uuidv4();
  exec(
    `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit, unit_price, amount, charge_type_id, meta_json)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      id,
      invoiceId,
      description,
      quantity,
      unit ?? null,
      unit_price,
      amount,
      chargeTypeId ?? null,
      meta ? JSON.stringify(meta) : null,
    ],
  );
}

function recalcInvoice(invoiceId: string) {
  const sum =
    query<{ sum: number }>(`SELECT SUM(amount) as sum FROM invoice_items WHERE invoice_id = ?`, [
      invoiceId,
    ])[0]?.sum ?? 0;
  exec(
    `UPDATE invoices SET subtotal = ?, total = ?, status = CASE WHEN total>0 THEN status ELSE 'open' END WHERE id = ?`,
    [sum, sum, invoiceId],
  );
}

// cập nhật đơn giá cho recurring charge hiện tại
export function updateRecurringChargePrice(
  leaseId: string,
  chargeTypeId: string,
  newPrice: number,
) {
  exec(
    `UPDATE recurring_charges SET unit_price = ? WHERE lease_id = ? AND charge_type_id = ?`,
    [newPrice, leaseId, chargeTypeId],
  );
}

// tính & tất toán kỳ: variableInputs có meter_end để snapshot & roll
export function settleCycleWithInputs(
  cycleId: string,
  variableInputs: Array<{ charge_type_id: string; quantity: number; meter_end?: number }>,
  extraCosts: Array<{ name: string; amount: number }> = [],
) {
  const c = getCycle(cycleId);
  if (!c) throw new Error('Cycle not found');
  const inv = openInvoiceForCycle(cycleId);
  const lease = getLease(inv.lease_id);

  // LẤY danh sách phí tại thời điểm hiện tại (để snapshot)
  const charges = listChargesForLease(inv.lease_id);

  // 1) Phí cố định (bao gồm “Tiền phòng” = base_rent hiện tại)
  for (const ch of charges) {
    if (Number(ch.is_variable) === 1) continue;
    const qty = 1;
    const price = Number(ch.unit_price) || 0;
    addInvoiceItem(
      inv.id,
      ch.name,
      qty,
      ch.unit || (ch.name.toLowerCase() === 'tiền phòng' ? 'tháng' : undefined),
      price,
      qty * price,
      ch.charge_type_id,
    );
  }

  // 2) Phí biến đổi theo inputs (snapshot meter_start & meter_end)
  for (const inp of variableInputs) {
    const ch = (charges as any[]).find(x => x.charge_type_id === inp.charge_type_id);
    if (!ch) continue;
    const qty = Math.max(0, Number(inp.quantity) || 0);
    const price = Number(ch.unit_price) || 0;
    const meta = {
      variable: true,
      meter_start: Number(ch.meter_start || 0),
      meter_end: Number(inp.meter_end || 0),
    };
    addInvoiceItem(inv.id, ch.name, qty, ch.unit, price, qty * price, ch.charge_type_id, meta);
  }

  // 3) Phụ phí phát sinh
  for (const ex of extraCosts) {
    const amt = Number(ex.amount) || 0;
    if (ex.name && amt > 0)
      addInvoiceItem(inv.id, ex.name, 1, undefined, amt, amt, undefined, { extra: true });
  }

  // 4) Tổng
  recalcInvoice(inv.id);

  // 5) Chốt kỳ
  exec(`UPDATE lease_cycles SET status = 'settled' WHERE id = ?`, [cycleId]);

  // 6) Tạo kỳ kế tiếp (để người dùng thấy trước theo yêu cầu), và roll meter_start
  const end = new Date(c.period_end);
  const nextStart = addDays(end, 0);
  createNextCycle(inv.lease_id, toYMD(nextStart), lease.billing_cycle);

  // Roll meter_start bằng meter_end từ items
  const items = getInvoiceItems(inv.id) as any[];
  const meterMap: Record<string, number> = {};
  for (const it of items) {
    if (it.charge_type_id && it.meta_json) {
      try {
        const m = JSON.parse(it.meta_json);
        if (typeof m?.meter_end === 'number') meterMap[it.charge_type_id] = m.meter_end;
      } catch {}
    }
  }
  for (const [ctId, endVal] of Object.entries(meterMap)) {
    const row = query<any>(
      `SELECT config_json FROM recurring_charges WHERE lease_id = ? AND charge_type_id = ? LIMIT 1`,
      [inv.lease_id, ctId],
    )[0];
    let cfg = {};
    try {
      cfg = row?.config_json ? JSON.parse(row.config_json) : {};
    } catch {}
    (cfg as any).meter_start = endVal;
    exec(
      `UPDATE recurring_charges SET config_json = ? WHERE lease_id = ? AND charge_type_id = ?`,
      [JSON.stringify(cfg), inv.lease_id, ctId],
    );
  }

  return getInvoice(inv.id);
}

function createNextCycle(
  leaseId: string,
  startDate: string,
  billing: 'daily' | 'monthly' | 'yearly',
) {
  const s = new Date(startDate);
  let e: Date;
  if (billing === 'daily') e = addDays(s, 1);
  else if (billing === 'monthly') e = addMonths(s, 1);
  else e = addYears(s, 1);
  const due = addDays(e, 0);
  const id = uuidv4();
  exec(
    `INSERT INTO lease_cycles (id, lease_id, period_start, period_end, due_date, status) VALUES (?,?,?,?,?,?)`,
    [id, leaseId, toYMD(s), toYMD(e), toYMD(due), 'open'],
  );
  return id;
}

// ====== Payments / Reports ======
export function recordPayment(invoiceId: string, amount: number, method: string) {
  const id = uuidv4();
  exec(
    `INSERT INTO payments (id, invoice_id, payment_date, amount, method) VALUES (?,?,?,?,?)`,
    [id, invoiceId, toYMD(new Date()), amount, method],
  );
  const inv = getInvoice(invoiceId);
  const paid =
    query<{ sum: number }>(`SELECT SUM(amount) sum FROM payments WHERE invoice_id = ?`, [
      invoiceId,
    ])[0]?.sum ?? 0;
  const status = paid >= inv.total ? 'paid' : 'partial';
  exec(`UPDATE invoices SET status = ? WHERE id = ?`, [status, invoiceId]);
}

// ====== App Meta (seed & housekeeping) ======
function ensureAppMetaTable() {
  exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)`);
}
function getMeta(key: string): string | null {
  ensureAppMetaTable();
  return (
    query<{ value: string }>(`SELECT value FROM app_meta WHERE key = ? LIMIT 1`, [key])[0]?.value ??
    null
  );
}
function setMeta(key: string, value: string) {
  ensureAppMetaTable();
  exec(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

/** Seed danh mục khoản phí mặc định — gọi an toàn nhiều lần */
export function seedChargeCatalogOnce() {
  if (getMeta('charge_catalog_seeded') === '1') return;

  // Cố định (tháng)
  upsertChargeType('Gửi xe', 'tháng', 'flat', 0, false);
  upsertChargeType('Internet', 'tháng', 'flat', 0, false);
  upsertChargeType('Rác', 'tháng', 'flat', 0, false);
  upsertChargeType('Bảo trì', 'tháng', 'flat', 0, false);
  upsertChargeType('An Ninh', 'tháng', 'flat', 0, false);

  // Biến đổi
  upsertChargeType('Điện', 'kWh', 'per_unit', 0, true);
  upsertChargeType('Nước', 'm3', 'per_unit', 0, true);

  setMeta('charge_catalog_seeded', '1');
}

/** Tự đóng các hợp đồng đã hết hạn & giải phóng phòng */
export function closeExpiredLeases() {
  // yyyy-mm-dd
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayISO = `${yyyy}-${mm}-${dd}`;

  const expired = query<any>(
    `SELECT l.id, l.room_id
       FROM leases l
      WHERE l.status = 'active'
        AND l.end_date IS NOT NULL
        AND l.end_date < ?`,
    [todayISO],
  );

  if (!expired.length) return;

  for (const row of expired) {
    // kết thúc hợp đồng
    exec(`UPDATE leases SET status = 'ended' WHERE id = ?`, [row.id]);
    // mở phòng
    if (row.room_id) {
      exec(
        `UPDATE rooms SET status = 'available'
           WHERE id = ? AND status != 'available'`,
        [row.room_id],
      );
    }
  }
}
