// src/services/rent.ts
import {exec, query} from '../db';
import {v4 as uuidv4} from 'uuid';

/**
 * BẢNG CHÍNH (đã tạo trong initDb)
 * - apartments, rooms, tenants, leases
 * - charge_types
 * - recurring_charges         <-- liên kết lease ↔ fees (config_json.meter_start)
 * - lease_cycles, invoices, invoice_items, payments
 */

// ========== Types ==========
type LeaseType = 'short_term' | 'long_term';
type Billing = 'daily' | 'monthly' | 'yearly';
type CollectWhen = 'start' | 'end';
export type FixedOrVariable = 'fixed' | 'variable';

export type LeaseConfig = {
  roomId: string;
  leaseType: LeaseType;
  billing: Billing;
  startDateISO: string;      // 'YYYY-MM-DD'
  baseRent: number;
  baseRentCollect?: CollectWhen; // default 'start'
  deposit?: number;
  durationDays?: number;     // short_term
  isAllInclusive?: boolean;  // giữ tương thích
  endDateISO?: string;
  charges?: Array<{
    name: string;
    type: FixedOrVariable;
    unit?: string|null;
    unitPrice?: number|null;
    meterStart?: number|null;
  }>;
  tenant?: { full_name: string; phone?: string; id_number?: string; note?: string };
};

type AddRecurringItem = {
  name: string;
  isVariable: boolean;
  unit?: string;
  price: number;
  meterStart?: number;
};

// Kết quả trả về sau khi tất toán – để UI quyết định gia hạn
export type SettleResult = {
  invoiceId: string;
  total: number;
  isLastCycle: boolean; // true => hiện popup hỏi gia hạn
  nextStart?: string;   // ngày bắt đầu của kỳ kế tiếp (gợi ý nếu gia hạn)
};

// ========== Helpers ==========
function addMonths(d: Date, n: number){ const x=new Date(d); x.setMonth(x.getMonth()+n); return x; }
function addYears(d: Date, n: number){ const x=new Date(d); x.setFullYear(x.getFullYear()+n); return x; }
function addDays(d: Date, n: number){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function toYMD(d: Date){ return d.toISOString().slice(0,10); }

// ========== Apartments ==========
export function createApartment(name: string, address?: string) {
  const id = uuidv4();
  exec(`INSERT INTO apartments (id, name, address) VALUES (?,?,?)`, [id, name, address ?? null]);
  return id;
}
export function deleteApartment(apartmentId: string) {
  const rooms = query<{c: number}>(`SELECT COUNT(*) AS c FROM rooms WHERE apartment_id = ?`, [apartmentId])[0]?.c ?? 0;
  if (rooms > 0) throw new Error('Căn hộ còn phòng, không thể xoá.');
  exec(`DELETE FROM apartments WHERE id = ?`, [apartmentId]);
}

// ========== Rooms ==========
export function createRoom(apartmentId: string, code: string, floor?: number, area?: number) {
  const id = uuidv4();
  exec(
    `INSERT INTO rooms (id, apartment_id, code, floor, area, status) VALUES (?,?,?,?,?,?)`,
    [id, apartmentId, code, floor ?? null, area ?? null, 'available']
  );
  return id;
}
export function deleteRoom(roomId: string) {
  const leases = query<{c: number}>(`SELECT COUNT(*) AS c FROM leases WHERE room_id = ? AND status = 'active'`, [roomId])[0]?.c ?? 0;
  if (leases > 0) throw new Error('Phòng còn hợp đồng, không thể xoá.');
  exec(`DELETE FROM rooms WHERE id = ?`, [roomId]);
}
export function getRoom(roomId: string) {
  return query(`SELECT * FROM rooms WHERE id = ?`, [roomId])[0];
}

// ========== Tenants ==========
export function createTenant(full_name: string, phone?: string, id_number?: string, note?: string) {
  const id = uuidv4();
  exec(
    `INSERT INTO tenants (id, full_name, phone, id_number, note) VALUES (?,?,?,?,?)`,
    [id, full_name, phone ?? null, id_number ?? null, note ?? null]
  );
  return id;
}
export function getTenant(id: string) {
  return query(`SELECT * FROM tenants WHERE id = ?`, [id])[0];
}
export function listTenants() {
  return query(`SELECT * FROM tenants ORDER BY created_at DESC`);
}

// ========== Charge Types ==========
export function upsertChargeType(
  name: string,
  unit?: string | null,
  pricing_model: 'flat'|'per_unit' = 'flat',
  unit_price?: number | null,
  is_variable = false
) {
  const found = query<{id:string}>(`SELECT id FROM charge_types WHERE name = ? LIMIT 1`, [name])[0];
  if (found) {
    exec(
      `UPDATE charge_types SET unit = ?, pricing_model = ?, unit_price = ?, meta_json = ? WHERE id = ?`,
      [unit||null, pricing_model, unit_price ?? null, JSON.stringify({is_variable}), found.id]
    );
    return found.id;
  }
  const id = uuidv4();
  exec(
    `INSERT INTO charge_types (id, name, unit, pricing_model, unit_price, meta_json) VALUES (?,?,?,?,?,?)`,
    [id, name, unit||null, pricing_model, unit_price ?? null, JSON.stringify({is_variable})]
  );
  return id;
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

// ========== Leases ==========
export function getLease(leaseId: string) {
  return query(`SELECT * FROM leases WHERE id = ?`, [leaseId])[0];
}
export function getLeaseByRoom(roomId: string) {
  return query(`SELECT * FROM leases WHERE room_id = ? AND status = 'active' LIMIT 1`, [roomId])[0];
}

/** Tạo hợp đồng (lưu base_rent, không tạo charge “Tiền phòng”) */
export function startLeaseAdvanced(cfg: LeaseConfig) {
  const id = uuidv4();
  const {
    roomId, leaseType, billing, startDateISO,
    baseRent, deposit = 0, durationDays,
    endDateISO, tenant, charges, baseRentCollect = 'start',
  } = cfg;

  let tenantId: string | null = null;
  if (tenant?.full_name) {
    tenantId = createTenant(tenant.full_name, tenant.phone, tenant.id_number, tenant.note);
  }

  const billing_cycle: Billing = leaseType === 'short_term' ? 'daily' : billing;

  exec(
    `INSERT INTO leases (
      id, room_id, lease_type, start_date, billing_cycle,
      base_rent, deposit_amount, duration_days, is_all_inclusive, end_date,
      status, tenant_id, base_rent_collect
    ) VALUES (?,?,?,?,?,?,?,?,?,?, 'active', ?, ?)`,
    [
      id, roomId, leaseType, startDateISO, billing_cycle,
      baseRent, deposit, durationDays ?? null, 0, endDateISO ?? null,
      tenantId, baseRentCollect,
    ]
  );

  exec(`UPDATE rooms SET status = 'occupied' WHERE id = ?`, [roomId]);

  // charges → recurring_charges (chuẩn hoá key meter_start)
  if (Array.isArray(charges) && charges.length) {
    for (const ch of charges) {
      const ctId = upsertChargeType(
        ch.name, ch.unit ?? null,
        ch.type === 'variable' ? 'per_unit' : 'flat',
        ch.unitPrice ?? 0,
        ch.type === 'variable'
      );
      addRecurringCharge(id, ctId, ch.unitPrice ?? 0, ch.type === 'variable' ? 1 : 0, {
        meter_start: ch.type === 'variable' ? (ch.meterStart ?? 0) : undefined,
      });
    }
  }

  // Kỳ đầu tiên
  createFirstCycle(id, startDateISO, billing_cycle, durationDays);
  return id;
}

export function updateLeaseBaseRent(leaseId: string, newBase: number) {
  exec(`UPDATE leases SET base_rent = ? WHERE id = ?`, [newBase, leaseId]);
}

/** Thêm recurring (config chuẩn: {meter_start}) */
export function addRecurringCharge(
  leaseId: string,
  chargeTypeId: string,
  unit_price?: number,
  is_variable?: number,
  config?: any
) {
  const id = uuidv4();
  let cfg: any = null;
  if (config) {
    const src = typeof config === 'object' ? config : {};
    const ms = (src as any).meter_start ?? (src as any).meterStart ?? undefined;
    cfg = {...src};
    if (ms !== undefined) { delete (cfg as any).meterStart; (cfg as any).meter_start = Number(ms) || 0; }
  }
  exec(`
    INSERT INTO recurring_charges (id, lease_id, charge_type_id, unit_price, is_variable, config_json)
    VALUES (?,?,?,?,?,?)
  `, [id, leaseId, chargeTypeId, unit_price ?? 0, is_variable ?? 0, cfg ? JSON.stringify(cfg) : null]);
  return id;
}

/** Thêm nhiều khoản custom */
export function addCustomRecurringCharges(leaseId: string, items: AddRecurringItem[]) {
  for (const it of items) {
    const ctId = addCustomChargeType(it.name, it.isVariable, it.unit, it.price);
    addRecurringCharge(leaseId, ctId, it.price, it.isVariable ? 1 : 0, {
      meter_start: it.isVariable ? (it.meterStart ?? 0) : undefined,
    });
  }
}

export function listChargesForLease(leaseId: string) {
  const rows = query<any>(`
    SELECT rc.id, rc.lease_id, rc.charge_type_id, rc.unit_price, rc.is_variable, rc.config_json,
           ct.name, ct.unit, ct.pricing_model
    FROM recurring_charges rc
    JOIN charge_types ct ON ct.id = rc.charge_type_id
    WHERE rc.lease_id = ?
    ORDER BY ct.name ASC
  `, [leaseId]);
  return rows.map(r => {
    let meter_start = 0;
    try {
      const cfg = r.config_json ? JSON.parse(r.config_json) : null;
      if (cfg && typeof cfg.meter_start === 'number') meter_start = cfg.meter_start;
      else if (cfg && typeof cfg.meterStart === 'number') meter_start = cfg.meterStart; // hỗ trợ cũ
    } catch {}
    return {...r, meter_start};
  });
}

export function updateRecurringChargePrice(leaseId: string, chargeTypeId: string, newPrice: number) {
  exec(`UPDATE recurring_charges SET unit_price = ? WHERE lease_id = ? AND charge_type_id = ?`,
    [newPrice, leaseId, chargeTypeId]);
}

export function hasUnpaidCycles(leaseId: string) {
  const rows = query<{cnt:number}>(`
    SELECT COUNT(*) cnt
    FROM lease_cycles c
    LEFT JOIN invoices i ON i.id = c.invoice_id
    WHERE c.lease_id = ?
      AND (c.status != 'settled' OR (i.status IS NOT NULL AND i.status != 'paid'))
  `, [leaseId]);
  return (rows[0]?.cnt ?? 0) > 0;
}
export function endLeaseEarly(leaseId: string, endDate: string) {
  if (hasUnpaidCycles(leaseId)) throw new Error('Còn kỳ chưa thanh toán.');
  exec(`UPDATE leases SET status = 'ended', end_date = ? WHERE id = ?`, [endDate, leaseId]);
  const lease = getLease(leaseId);
  if (lease?.room_id) exec(`UPDATE rooms SET status = 'available' WHERE id = ?`, [lease.room_id]);
}

export function nextDueDate(leaseId: string) {
  return query<{due_date: string}>(`
    SELECT due_date FROM lease_cycles
    WHERE lease_id = ? AND status != 'settled'
    ORDER BY due_date ASC LIMIT 1
  `, [leaseId])[0]?.due_date;
}

// ========== Cycles ==========
function createFirstCycle(leaseId: string, startDate: string, billing: Billing, durationDays?: number) {
  const s = new Date(startDate);
  let e: Date;
  if (billing === 'daily') {
    e = addDays(s, Math.max(1, (durationDays ?? 1)) - 1);
  } else if (billing === 'monthly') {
    e = addDays(addMonths(s, 1), -1);
  } else {
    e = addDays(addYears(s, 1), -1);
  }
  const id = uuidv4();
  exec(
    `INSERT INTO lease_cycles (id, lease_id, period_start, period_end, due_date, status)
     VALUES (?,?,?,?,?,?)`,
    [id, leaseId, toYMD(s), toYMD(e), toYMD(e), 'open']
  );
  return id;
}
export function createNextCycle(leaseId: string, startDate: string, billing: Billing) {
  const s = new Date(startDate);
  let e: Date;
  if (billing === 'daily') {
    e = s;
  } else if (billing === 'monthly') {
    e = addDays(addMonths(s, 1), -1);
  } else {
    e = addDays(addYears(s, 1), -1);
  }
  const id = uuidv4();
  exec(
    `INSERT INTO lease_cycles (id, lease_id, period_start, period_end, due_date, status)
     VALUES (?,?,?,?,?, 'open')`,
    [id, leaseId, toYMD(s), toYMD(e), toYMD(e)]
  );
  return id;
}
export function createNextCycleFromCycle(cycleId: string) {
  const c = getCycle(cycleId);
  if (!c) throw new Error('Cycle not found');
  const lease = getLease(c.lease_id);
  const nextStart = toYMD(addDays(new Date(c.period_end), 1));
  return createNextCycle(c.lease_id, nextStart, lease.billing_cycle as Billing);
}

export function concludeLeaseFromCycle(cycleId: string) {
  const c = getCycle(cycleId);
  if (!c) return;
  exec(`UPDATE leases SET status='ended', end_date=? WHERE id=?`, [c.period_end, c.lease_id]);
  const lease = getLease(c.lease_id);
  if (lease?.room_id) exec(`UPDATE rooms SET status='available' WHERE id=?`, [lease.room_id]);
}

export function listCycles(leaseId: string) {
  return query(`SELECT * FROM lease_cycles WHERE lease_id = ? ORDER BY period_start ASC`, [leaseId]);
}
export function listSettledCyclesDesc(leaseId: string) {
  return query(`
    SELECT * FROM lease_cycles
    WHERE lease_id = ? AND status = 'settled'
    ORDER BY period_start DESC
  `, [leaseId]);
}
export function getCycle(cycleId: string) {
  return query(`SELECT * FROM lease_cycles WHERE id = ?`, [cycleId])[0];
}

// ========== Invoices ==========
export function openInvoiceForCycle(cycleId: string) {
  const c = getCycle(cycleId);
  if (!c) throw new Error('Cycle not found');
  if (c.invoice_id) return query(`SELECT * FROM invoices WHERE id = ?`, [c.invoice_id])[0];

  const id = uuidv4();
  exec(
    `INSERT INTO invoices (id, lease_id, period_start, period_end, issue_date, subtotal, total, status)
     SELECT ?, lease_id, period_start, period_end, date('now'), 0, 0, 'open' FROM lease_cycles WHERE id = ?`,
    [id, cycleId]
  );
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
  unit: string | undefined,
  unit_price: number,
  amount: number,
  chargeTypeId?: string,
  meta?: any
) {
  const id = uuidv4();
  exec(
    `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit, unit_price, amount, charge_type_id, meta_json)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, invoiceId, description, quantity, unit ?? null, unit_price, amount, chargeTypeId ?? null, meta ? JSON.stringify(meta) : null]
  );
}
function recalcInvoice(invoiceId: string) {
  const sum = query<{sum:number}>(`SELECT SUM(amount) as sum FROM invoice_items WHERE invoice_id = ?`, [invoiceId])[0]?.sum ?? 0;
  exec(`UPDATE invoices SET subtotal = ?, total = ?, status = CASE WHEN total>0 THEN status ELSE 'open' END WHERE id = ?`, [sum, sum, invoiceId]);
}
export function recordPayment(invoiceId: string, amount: number, method: string) {
  const id = uuidv4();
  exec(
    `INSERT INTO payments (id, invoice_id, payment_date, amount, method) VALUES (?,?,?,?,?)`,
    [id, invoiceId, toYMD(new Date()), amount, method]
  );
  const inv = getInvoice(invoiceId);
  const paid = query<{sum:number}>(`SELECT SUM(amount) sum FROM payments WHERE invoice_id = ?`, [invoiceId])[0]?.sum ?? 0;
  const status = paid >= inv.total ? 'paid' : 'partial';
  exec(`UPDATE invoices SET status = ? WHERE id = ?`, [status, invoiceId]);
}

// ========== SETTLE (Tất toán) ==========
export function settleCycleWithInputs(
  cycleId: string,
  variableInputs: Array<{charge_type_id: string; quantity: number; meter_end?: number}>,
  extraCosts: Array<{name: string; amount: number}> = []
): SettleResult {
  const c = getCycle(cycleId);
  if (!c) throw new Error('Cycle not found');
  const inv = openInvoiceForCycle(cycleId);
  const lease = getLease(inv.lease_id);

  // ===== Xác định kỳ "được thu" cho dòng Tiền nhà theo cài đặt =====
  const collectWhen: 'start'|'end' = (lease?.base_rent_collect || 'start') as any;
  const base = Number(lease?.base_rent || 0);

  // Tính kỳ kế tiếp của c hiện tại
  const endCur   = new Date(c.period_end);
  let nextStart: Date, nextEnd: Date;
  if (lease.billing_cycle === 'yearly') {
    nextStart = addDays(endCur, 1); nextEnd = addDays(addYears(nextStart, 1), -1);
  } else if (lease.billing_cycle === 'monthly') {
    nextStart = addDays(endCur, 1); nextEnd = addDays(addMonths(nextStart, 1), -1);
  } else { // daily
    nextStart = addDays(endCur, 1); nextEnd = nextStart;
  }

  const isLastCycle =
    !!lease?.end_date && (toYMD(endCur) >= String(lease.end_date));

  // ===== 0) Dòng "Giá thuê cơ bản (Tiền nhà)" =====
  if (base > 0) {
    if (collectWhen === 'end') {
      addInvoiceItem(inv.id, 'Giá thuê cơ bản (Tiền nhà)', 1, 'tháng', base, base, undefined, {
        base: true, cycle_of: 'current',
        for_period_start: c.period_start, for_period_end: c.period_end,
      });
    } else {
      if (!isLastCycle) {
        addInvoiceItem(inv.id, 'Giá thuê cơ bản (Tiền nhà)', 1, 'tháng', base, base, undefined, {
          base: true, cycle_of: 'next',
          for_period_start: toYMD(nextStart), for_period_end: toYMD(nextEnd),
        });
      }
    }
  }

  // ===== 1) Snapshot phí CỐ ĐỊNH (trừ 'Tiền phòng')
  const charges = listChargesForLease(inv.lease_id);
  for (const ch of charges) {
    if (Number(ch.is_variable) === 1) continue;
    if (String(ch.name).toLowerCase() === 'tiền phòng') continue;
    const price = Number(ch.unit_price) || 0;
    addInvoiceItem(inv.id, ch.name, 1, ch.unit || 'tháng', price, price, ch.charge_type_id, {
      cycle_of: 'current',
      for_period_start: c.period_start, for_period_end: c.period_end,
    });
  }

  // ===== 2) Biến đổi (điện/nước)
  for (const inp of variableInputs) {
    const ch = (charges as any[]).find(x => x.charge_type_id === inp.charge_type_id);
    if (!ch) continue;
    const qty = Math.max(0, Number(inp.quantity) || 0);
    const price = Number(ch.unit_price) || 0;
    addInvoiceItem(inv.id, ch.name, qty, ch.unit, price, qty * price, ch.charge_type_id, {
      variable: true,
      meter_start: Number(ch.meter_start || 0),
      meter_end: Number(inp.meter_end || 0),
      cycle_of: 'current',
      for_period_start: c.period_start, for_period_end: c.period_end,
    });
  }

  // ===== 3) Phụ phí phát sinh
  for (const ex of extraCosts) {
    const amt = Number(ex.amount) || 0;
    if (ex.name && amt > 0) {
      addInvoiceItem(inv.id, ex.name, 1, undefined, amt, amt, undefined, {
        extra: true,
        cycle_of: 'current',
        for_period_start: c.period_start, for_period_end: c.period_end,
      });
    }
  }

  // ===== 4) Tổng & chốt kỳ
  recalcInvoice(inv.id);
  exec(`UPDATE lease_cycles SET status='settled' WHERE id=?`, [cycleId]);

  // ===== 5) Roll meter_start cho biến đổi (để nếu gia hạn sẽ nối tiếp)
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
      `SELECT config_json FROM recurring_charges WHERE lease_id=? AND charge_type_id=? LIMIT 1`,
      [inv.lease_id, ctId]
    )[0];
    let cfg = {};
    try { cfg = row?.config_json ? JSON.parse(row.config_json) : {}; } catch {}
    (cfg as any).meter_start = endVal;
    exec(
      `UPDATE recurring_charges SET config_json=? WHERE lease_id=? AND charge_type_id=?`,
      [JSON.stringify(cfg), inv.lease_id, ctId]
    );
  }

  // KHÔNG tạo kỳ mới nếu là kỳ cuối → để UI hỏi gia hạn
  const res: SettleResult = {
    invoiceId: inv.id,
    total: query<{total:number}>(`SELECT total FROM invoices WHERE id=?`, [inv.id])[0]?.total ?? 0,
    isLastCycle,
    nextStart: toYMD(nextStart),
  };
  return res;
}

// ========== Reports ==========
export function revenueByMonth(year: number, month: number) {
  const ym = `${year}-${String(month).padStart(2,'0')}`;
  const rows = query<{sum:number}>(`
    SELECT SUM(total) sum FROM invoices
    WHERE strftime('%Y-%m', issue_date) = ?`, [ym]);
  return rows[0]?.sum ?? 0;
}

// ========== Seed & Housekeeping ==========
const rid = () => 'ct_' + Math.random().toString(36).slice(2) + Date.now();

export function ensureChargeTypesTable() {
  exec(`
    CREATE TABLE IF NOT EXISTS charge_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT,
      pricing_model TEXT NOT NULL DEFAULT 'flat',
      unit_price REAL NOT NULL DEFAULT 0,
      meta_json TEXT
    )`);
}

/** Seed mặc định (không có Gói bao phí/ Tiền phòng) */
export function seedChargeCatalogOnce() {
  ensureChargeTypesTable();
  const existed = query<{ c: number }>(`SELECT COUNT(*) AS c FROM charge_types`);
  if ((existed?.[0]?.c ?? 0) > 0) return;

  const defaults = [
    { name: 'Gửi xe',   unit: 'tháng', pricing_model: 'flat'   as const, unit_price: 0 },
    { name: 'Internet', unit: 'tháng', pricing_model: 'flat'   as const, unit_price: 0 },
    { name: 'Rác',      unit: 'tháng', pricing_model: 'flat'   as const, unit_price: 0 },
    { name: 'Bảo trì',  unit: 'tháng', pricing_model: 'flat'   as const, unit_price: 0 },
    { name: 'An Ninh',  unit: 'tháng', pricing_model: 'flat'   as const, unit_price: 0 },
    { name: 'Điện',     unit: 'kWh',   pricing_model: 'per_unit' as const, unit_price: 0, meta: {is_variable:true} },
    { name: 'Nước',     unit: 'm3',    pricing_model: 'per_unit' as const, unit_price: 0, meta: {is_variable:true} },
  ];
  for (const d of defaults) {
    exec(
      `INSERT INTO charge_types (id, name, unit, pricing_model, unit_price, meta_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [rid(), d.name, d.unit ?? null, d.pricing_model, d.unit_price ?? 0, d.meta ? JSON.stringify(d.meta) : null]
    );
  }
}

/** Tự đóng hợp đồng đã quá hạn và trả phòng */
export function closeExpiredLeases() {
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const expired = query<any>(`
    SELECT l.id, l.room_id
    FROM leases l
    WHERE l.status = 'active'
      AND l.end_date IS NOT NULL
      AND l.end_date < ?`, [todayISO]);

  for (const row of expired) {
    exec(`UPDATE leases SET status = 'ended' WHERE id = ?`, [row.id]);
    if (row.room_id) exec(`UPDATE rooms SET status = 'available' WHERE id = ? AND status != 'available'`, [row.room_id]);
  }
}

/** Migrate thêm cột base_rent_collect nếu thiếu */
export function ensureLeaseCollectColumn() {
  try {
    exec(`ALTER TABLE leases ADD COLUMN base_rent_collect TEXT DEFAULT 'start'`);
  } catch {}
}
