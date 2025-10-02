// src/services/rent.ts
import { exec, query } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../utils/i18nProxy';

let __i18nMod: any;
try {
  // kỳ vọng có export t() từ src/i18n
  // ví dụ: export const t = (k:string, params?:any)=> i18next.t(k, params)
  // hoặc module tương đương.
  __i18nMod = require('../i18n');
} catch {}

// ===== Types =====
type LeaseType = 'short_term' | 'long_term';
type Billing = 'daily' | 'monthly' | 'yearly';
type CollectWhen = 'start' | 'end';
export type FixedOrVariable = 'fixed' | 'variable';

export type LeaseConfig = {
  roomId: string;
  leaseType: LeaseType;
  billing: Billing;
  startDateISO: string;
  baseRent: number;
  baseRentCollect?: CollectWhen;
  deposit?: number;
  durationDays?: number;
  isAllInclusive?: boolean;
  endDateISO?: string;
  charges?: Array<{
    name: string;
    type: FixedOrVariable;
    unit?: string | null;
    unitPrice?: number | null;
    meterStart?: number | null;
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

// ===== Dates helpers =====
const toYMD = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};
const addYears = (d: Date, n: number) => {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + n);
  return x;
};

// ===== Apartments / Rooms =====
export function createApartment(name: string, address?: string) {
  const id = uuidv4();
  exec(`INSERT INTO apartments (id, name, address) VALUES (?,?,?)`, [id, name, address ?? null]);
  return id;
}
export function deleteApartment(apartmentId: string) {
  const rooms =
    query<{ c: number }>(`SELECT COUNT(*) c FROM rooms WHERE apartment_id = ?`, [apartmentId])[0]?.c ??
    0;
  if (rooms > 0) throw new Error(t('rent.apartmentexistroom'));
  exec(`DELETE FROM apartments WHERE id = ?`, [apartmentId]);
}

export function createRoom(apartmentId: string, code: string, floor?: number, area?: number) {
  const norm = (code || '').trim();
  if (!norm) throw new Error('EMPTY_CODE');

  // Kiểm tra trùng mã trong cùng apartment (không phân biệt hoa/thường)
  const exist =
    query<{ c: number }>(
      `SELECT COUNT(*) c FROM rooms WHERE apartment_id = ? AND lower(code) = lower(?)`,
      [apartmentId, norm],
    )[0]?.c ?? 0;

  if (exist > 0) {
    // ném lỗi có mã để UI map message đẹp
    throw new Error('DUPLICATE_ROOM_CODE');
  }

  const id = uuidv4();
  exec(
    `INSERT INTO rooms (id, apartment_id, code, floor, area, status) VALUES (?,?,?,?,?,?)`,
    [id, apartmentId, norm, floor ?? null, area ?? null, 'available'],
  );
  return id;
}
export function deleteRoom(roomId: string) {
  const leases =
    query<{ c: number }>(
      `SELECT COUNT(*) c FROM leases WHERE room_id = ? AND status = 'active'`,
      [roomId],
    )[0]?.c ?? 0;
  if (leases > 0) throw new Error(t('rent.roomexistcontact'));
  exec(`DELETE FROM rooms WHERE id = ?`, [roomId]);
}
export function getRoom(roomId: string) {
  return query(`SELECT * FROM rooms WHERE id = ?`, [roomId])[0];
}

// ===== Tenants =====
export function createTenant(full_name: string, phone?: string, id_number?: string, note?: string) {
  const id = uuidv4();
  exec(
    `INSERT INTO tenants (id, full_name, phone, id_number, note) VALUES (?,?,?,?,?)`,
    [id, full_name, phone ?? null, id_number ?? null, note ?? null],
  );
  return id;
}
export function getTenant(id: string) {
  return query(`SELECT * FROM tenants WHERE id = ?`, [id])[0];
}
export function listTenants() {
  return query(`SELECT * FROM tenants ORDER BY created_at DESC`);
}

// ===== Charge types =====
export function upsertChargeType(
  name: string,
  unit?: string | null,
  pricing_model: 'flat' | 'per_unit' = 'flat',
  unit_price?: number | null,
  is_variable = false,
) {
  const found = query<{ id: string }>(`SELECT id FROM charge_types WHERE name = ? LIMIT 1`, [
    name,
  ])[0];
  if (found) {
    exec(`UPDATE charge_types SET unit=?, pricing_model=?, unit_price=?, meta_json=? WHERE id=?`, [
      unit || null,
      pricing_model,
      unit_price ?? null,
      JSON.stringify({ is_variable }),
      found.id,
    ]);
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

// ===== Leases =====
export function getLease(leaseId: string) {
  return query(`SELECT * FROM leases WHERE id = ?`, [leaseId])[0];
}
export function getLeaseByRoom(roomId: string) {
  return query(`SELECT * FROM leases WHERE room_id=? AND status='active' LIMIT 1`, [roomId])[0];
}

export function startLeaseAdvanced(cfg: LeaseConfig) {
  const id = uuidv4();
  const {
    roomId,
    leaseType,
    billing,
    startDateISO,
    baseRent,
    baseRentCollect = 'start',
    deposit = 0,
    durationDays,
    endDateISO,
    tenant,
    charges,
  } = cfg;

  let tenantId: string | null = null;
  if (tenant?.full_name)
    tenantId = createTenant(tenant.full_name, tenant.phone, tenant.id_number, tenant.note);

  const billing_cycle: Billing = leaseType === 'short_term' ? 'daily' : billing;

  exec(
    `INSERT INTO leases (
      id, room_id, lease_type, start_date, billing_cycle,
      base_rent, deposit_amount, duration_days, is_all_inclusive,
      end_date, status, tenant_id, base_rent_collect
    ) VALUES (?,?,?,?,?,?,?,?,?,?, 'active', ?, ?)`,
    [
      id,
      roomId,
      leaseType,
      startDateISO,
      billing_cycle,
      baseRent,
      deposit,
      durationDays ?? null,
      0,
      endDateISO ?? null,
      tenantId,
      baseRentCollect,
    ],
  );
  exec(`UPDATE rooms SET status='occupied' WHERE id=?`, [roomId]);

  if (Array.isArray(charges) && charges.length) {
    for (const ch of charges) {
      const ctId = upsertChargeType(
        ch.name,
        ch.unit ?? null,
        ch.type === 'variable' ? 'per_unit' : 'flat',
        ch.unitPrice ?? 0,
        ch.type === 'variable',
      );
      addRecurringCharge(id, ctId, ch.unitPrice ?? 0, ch.type === 'variable' ? 1 : 0, {
        meter_start: ch.type === 'variable' ? ch.meterStart ?? 0 : undefined,
      });
    }
  }

  // tạo cycles đúng theo yêu cầu
  ensureCyclesForLease(id);
  return id;
}

export function updateLeaseBaseRent(leaseId: string, newBase: number) {
  exec(`UPDATE leases SET base_rent=? WHERE id=?`, [newBase, leaseId]);
}

// ===== recurring_charges =====
export function addRecurringCharge(
  leaseId: string,
  chargeTypeId: string,
  unit_price?: number,
  is_variable?: number,
  config?: any,
) {
  const id = uuidv4();
  let cfg = null;
  if (config && typeof config === 'object') {
    const ms = (config as any).meter_start ?? (config as any).meterStart;
    cfg = { ...config };
    if (ms !== undefined) {
      delete (cfg as any).meterStart;
      (cfg as any).meter_start = Number(ms) || 0;
    }
  }
  exec(
    `INSERT INTO recurring_charges (id, lease_id, charge_type_id, unit_price, is_variable, config_json)
     VALUES (?,?,?,?,?,?)`,
    [id, leaseId, chargeTypeId, unit_price ?? 0, is_variable ?? 0, cfg ? JSON.stringify(cfg) : null],
  );
  return id;
}

export function addCustomRecurringCharges(leaseId: string, items: AddRecurringItem[]) {
  for (const it of items) {
    const ctId = addCustomChargeType(it.name, it.isVariable, it.unit, it.price);
    addRecurringCharge(leaseId, ctId, it.price, it.isVariable ? 1 : 0, {
      meter_start: it.isVariable ? it.meterStart ?? 0 : undefined,
    });
  }
}

export function listChargesForLease(leaseId: string) {
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
      else if (cfg && typeof cfg.meterStart === 'number') meter_start = cfg.meterStart;
    } catch {}
    return { ...r, meter_start };
  });
}

export function updateRecurringChargePrice(leaseId: string, chargeTypeId: string, newPrice: number) {
  exec(`UPDATE recurring_charges SET unit_price=? WHERE lease_id=? AND charge_type_id=?`, [
    newPrice,
    leaseId,
    chargeTypeId,
  ]);
}

// ===== Cycles =====
export function listCycles(leaseId: string) {
  return query(`SELECT * FROM lease_cycles WHERE lease_id=? ORDER BY period_start ASC`, [leaseId]);
}
export function listSettledCyclesDesc(leaseId: string) {
  return query(
    `SELECT * FROM lease_cycles WHERE lease_id=? AND status='settled' ORDER BY period_start DESC`,
    [leaseId],
  );
}
export function getCycle(cycleId: string) {
  return query(`SELECT * FROM lease_cycles WHERE id=?`, [cycleId])[0];
}

function insertCycle(leaseId: string, s: Date, e: Date) {
  const id = uuidv4();
  exec(
    `INSERT INTO lease_cycles (id, lease_id, period_start, period_end, due_date, status)
        VALUES (?,?,?,?,?, 'open')`,
    [id, leaseId, toYMD(s), toYMD(e), toYMD(e)],
  );
  return id;
}

/** Tạo đầy đủ chu kỳ theo quy tắc:
 * - daily  : 1 chu kỳ, kéo dài duration_days (>=1, mặc định 1)
 * - monthly: nếu có end_date → tạo tất cả các kỳ [start..end] (mỗi kỳ 1 tháng),
 *            nếu không có end_date → chỉ tạo 1 kỳ
 * - yearly : giữ tương thích, coi như monthly 12 tháng
 */
export function ensureCyclesForLease(leaseId: string) {
  const lease = getLease(leaseId);
  if (!lease) return;

  // Nếu đã có chu kỳ rồi (tạo từ trước) thì thôi.
  const existing =
    query<{ c: number }>(`SELECT COUNT(*) c FROM lease_cycles WHERE lease_id=?`, [leaseId])[0]?.c ?? 0;
  if (existing > 0) return;

  const s0 = new Date(lease.start_date);

  // DAILY: giữ nguyên – tạo 1 chu kỳ theo số ngày
  if (lease.billing_cycle === 'daily') {
    const days = Math.max(1, Number(lease.duration_days || 1));
    const e0 = addDays(s0, days - 1);
    insertCycle(leaseId, s0, e0);
    return;
  }

  // MONTHLY / YEARLY → coi như theo tháng
  const endOfThisMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

  // Không tạo vượt quá end_date (nếu có)
  const hardEnd = lease.end_date
    ? new Date(Math.min(new Date(lease.end_date).getTime(), endOfThisMonth.getTime()))
    : endOfThisMonth;

  // Nếu start nằm sau "ngưỡng tạo" (start > hardEnd) → chỉ tạo kỳ đầu tiên
  const firstEnd = addDays(addMonths(s0, 1), -1);
  if (s0 > hardEnd) {
    insertCycle(leaseId, s0, firstEnd);
    return;
  }

  // Tạo liên tiếp từ tháng bắt đầu đến hardEnd (không vượt quá hôm nay/ end_date)
  let cursor = new Date(lease.start_date);
  while (true) {
    const e = addDays(addMonths(cursor, 1), -1);
    insertCycle(leaseId, cursor, e);
    if (e >= hardEnd) break;
    cursor = addDays(e, 1);
  }
}





export function extendLeaseAndAddCycles(leaseId: string, extraCount: number) {
  const lease = getLease(leaseId);
  if (!lease) throw new Error('Lease not found');

  const toYMD = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const addMonths = (d: Date, n: number) => {
    const x = new Date(d);
    x.setMonth(x.getMonth() + n);
    return x;
  };

  const last = query<any>(
    `
    SELECT * FROM lease_cycles
    WHERE lease_id = ?
    ORDER BY period_end DESC
    LIMIT 1
  `,
    [leaseId],
  )[0];
  if (!last) throw new Error('No cycle found');

  let start = addDays(new Date(last.period_end), 1);

  if (String(lease.billing_cycle) === 'monthly') {
    const n = Math.max(1, Number(extraCount || 0));
    let end: Date = new Date(last.period_end);
    for (let i = 0; i < n; i++) {
      const e = addDays(addMonths(start, 1), -1);
      insertCycle(leaseId, start, e);
      end = e;
      start = addDays(e, 1);
    }
    exec(`UPDATE leases SET end_date = ? WHERE id = ?`, [toYMD(end), leaseId]);
  } else {
    // daily
    const days = Math.max(1, Number(extraCount || 0));
    const e = addDays(start, days - 1);
    insertCycle(leaseId, start, e);
    exec(`UPDATE leases SET end_date = ? WHERE id = ?`, [toYMD(e), leaseId]);
  }
}

// ===== Invoices =====
export function openInvoiceForCycle(cycleId: string) {
  const c = getCycle(cycleId);
  if (!c) throw new Error('Cycle not found');
  if (c.invoice_id) return query(`SELECT * FROM invoices WHERE id=?`, [c.invoice_id])[0];
  const id = uuidv4();
  exec(
    `INSERT INTO invoices (id, lease_id, period_start, period_end, issue_date, subtotal, total, status)
        SELECT ?, lease_id, period_start, period_end, date('now'), 0, 0, 'open'
        FROM lease_cycles WHERE id=?`,
    [id, cycleId],
  );
  exec(`UPDATE lease_cycles SET invoice_id=? WHERE id=?`, [id, cycleId]);
  return query(`SELECT * FROM invoices WHERE id=?`, [id])[0];
}
export function getInvoice(id: string) {
  return query(`SELECT * FROM invoices WHERE id=?`, [id])[0];
}
export function getInvoiceItems(invoiceId: string) {
  return query(`SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY rowid ASC`, [invoiceId]);
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
    query<{ sum: number }>(`SELECT SUM(amount) sum FROM invoice_items WHERE invoice_id=?`, [
      invoiceId,
    ])[0]?.sum ?? 0;
  exec(
    `UPDATE invoices SET subtotal=?, total=?, status = CASE WHEN total>0 THEN status ELSE 'open' END WHERE id=?`,
    [sum, sum, invoiceId],
  );
}
export function recordPayment(invoiceId: string, amount: number, method: string) {
  const id = uuidv4();
  exec(
    `INSERT INTO payments (id, invoice_id, payment_date, amount, method) VALUES (?,?,?,?,?)`,
    [id, invoiceId, toYMD(new Date()), amount, method],
  );
  const inv = getInvoice(invoiceId);
  const paid =
    query<{ sum: number }>(`SELECT SUM(amount) sum FROM payments WHERE invoice_id=?`, [invoiceId])[0]
      ?.sum ?? 0;
  exec(`UPDATE invoices SET status=? WHERE id=?`, [paid >= inv.total ? 'paid' : 'partial', invoiceId]);
}

// ===== Settle cycle =====
export function settleCycleWithInputs(
  cycleId: string,
  variableInputs: Array<{ charge_type_id: string; quantity: number; meter_end?: number }>,
  extraCosts: Array<{ name: string; amount: number }> = [],
) {
  const c = getCycle(cycleId);
  if (!c) throw new Error('Cycle not found');
  const inv = openInvoiceForCycle(cycleId);
  const lease = getLease(inv.lease_id);

  const collectWhen: 'start' | 'end' = (lease?.base_rent_collect || 'start') as any;
  const base = Number(lease?.base_rent || 0);

  const endCur = new Date(c.period_end);
  const nextStart = addDays(endCur, 0);
  const nextEnd = addDays(addMonths(nextStart, 1), -1);
  const isLastCycle = lease?.end_date ? toYMD(endCur) >= String(lease.end_date) : false;

  if (base > 0) {
    if (collectWhen === 'end') {
      addInvoiceItem(inv.id, t('rent.roomprice'), 1, t('rent.month'), base, base, undefined, {
        base: true,
        cycle_of: 'current',
        for_period_start: c.period_start,
        for_period_end: c.period_end,
      });
    } else {
      if (!isLastCycle) {
        addInvoiceItem(inv.id, t('rent.roomprice'), 1, t('rent.month'), base, base, undefined, {
          base: true,
          cycle_of: 'next',
          for_period_start: toYMD(nextStart),
          for_period_end: toYMD(nextEnd),
        });
      }
    }
  }

  const charges = listChargesForLease(inv.lease_id);
  for (const ch of charges) {
    if (Number(ch.is_variable) === 1) continue;
    if (String(ch.name).toLowerCase() === t('rent.roomprice1')) continue;
    const price = Number(ch.unit_price) || 0;
    addInvoiceItem(inv.id, ch.name, 1, ch.unit || t('rent.month'), price, price, ch.charge_type_id, {
      cycle_of: 'current',
      for_period_start: c.period_start,
      for_period_end: c.period_end,
    });
  }

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
      for_period_start: c.period_start,
      for_period_end: c.period_end,
    });
  }

  for (const ex of extraCosts) {
    const amt = Number(ex.amount) || 0;
    if (ex.name && amt > 0)
      addInvoiceItem(inv.id, ex.name, 1, undefined, amt, amt, undefined, {
        extra: true,
        cycle_of: 'current',
        for_period_start: c.period_start,
        for_period_end: c.period_end,
      });
  }

  recalcInvoice(inv.id);
  exec(`UPDATE lease_cycles SET status='settled' WHERE id=?`, [cycleId]);

  // roll meter_start
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
      [inv.lease_id, ctId],
    )[0];
    let cfg = {};
    try {
      cfg = row?.config_json ? JSON.parse(row.config_json) : {};
    } catch {}
    (cfg as any).meter_start = endVal;
    exec(`UPDATE recurring_charges SET config_json=? WHERE lease_id=? AND charge_type_id=?`, [
      JSON.stringify(cfg),
      inv.lease_id,
      ctId,
    ]);
  }

  return getInvoice(inv.id);
}

// ===== Due date =====
export function nextDueDate(leaseId: string) {
  return query<{ due_date: string }>(
    `
    SELECT due_date FROM lease_cycles WHERE lease_id=? AND status!='settled' ORDER BY due_date ASC LIMIT 1
  `,
    [leaseId],
  )[0]?.due_date;
}

// ===== Reports =====
export function revenueByMonth(year: number, month: number) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const rows = query<{ sum: number }>(
    `SELECT SUM(total) sum FROM invoices WHERE strftime('%Y-%m', issue_date)=?`,
    [ym],
  );
  return rows[0]?.sum ?? 0;
}

// ===== Seed + housekeeping =====
const rid = () => 'ct_' + Math.random().toString(36).slice(2) + Date.now();
export function ensureChargeTypesTable() {
  exec(`CREATE TABLE IF NOT EXISTS charge_types(
    id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT,
    pricing_model TEXT NOT NULL DEFAULT 'flat',
    unit_price REAL NOT NULL DEFAULT 0, meta_json TEXT
  )`);
}
export function seedChargeCatalogOnce() {
  ensureChargeTypesTable();
  const c =
    query<{ c: number }>(`SELECT COUNT(*) c FROM charge_types`)[0]?.c ??
    0;
  if (c > 0) return;
  const defs = [
    { name: t('rent.carprice'), unit: t('rent.month'), pricing_model: 'flat', unit_price: 0 },
    { name: t('rent.internet'), unit: t('rent.month'), pricing_model: 'flat', unit_price: 0 },
    { name: t('rent.garbage'), unit: t('rent.month'), pricing_model: 'flat', unit_price: 0 },
    { name: t('rent.maintenance'), unit: t('rent.month'), pricing_model: 'flat', unit_price: 0 },
    { name: t('rent.security'), unit: t('rent.month'), pricing_model: 'flat', unit_price: 0 },
    { name: t('rent.electricity'), unit: 'kWh', pricing_model: 'per_unit', unit_price: 0, meta: { is_variable: true } },
    { name: t('rent.water'), unit: 'm3', pricing_model: 'per_unit', unit_price: 0, meta: { is_variable: true } },
  ] as any[];
  for (const d of defs) {
    exec(
      `INSERT INTO charge_types (id,name,unit,pricing_model,unit_price,meta_json) VALUES (?,?,?,?,?,?)`,
      [rid(), d.name, d.unit ?? null, d.pricing_model, d.unit_price ?? 0, d.meta ? JSON.stringify(d.meta) : null],
    );
  }
}

// ====== Operating Costs v2 (op_cost_* tables) ======
export function ensureOperatingCostTables() {
  exec(`CREATE TABLE IF NOT EXISTS op_cost_templates(
    id TEXT PRIMARY KEY,
    apartment_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_variable INTEGER NOT NULL DEFAULT 0,
    unit TEXT,
    default_amount INTEGER NOT NULL DEFAULT 0
  )`);
  exec(`CREATE TABLE IF NOT EXISTS op_cost_months(
    id TEXT PRIMARY KEY,
    apartment_id TEXT NOT NULL,
    ym TEXT NOT NULL
  )`);
  exec(`CREATE TABLE IF NOT EXISTS op_cost_items(
    id TEXT PRIMARY KEY,
    month_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_variable INTEGER NOT NULL DEFAULT 0,
    unit TEXT,
    amount INTEGER NOT NULL DEFAULT 0
  )`);
}

export function hasOperatingCostSetup(apartmentId: string) {
  ensureOperatingCostTables();
  const c =
    query<{ c: number }>(`SELECT COUNT(*) c FROM op_cost_templates WHERE apartment_id=?`, [
      apartmentId,
    ])[0]?.c ?? 0;
  return c > 0;
}

export function listOperatingCostTemplates(apartmentId: string) {
  ensureOperatingCostTables();
  return query<any>(
    `SELECT * FROM op_cost_templates WHERE apartment_id=? ORDER BY is_variable ASC, name ASC`,
    [apartmentId],
  );
}

export function upsertOperatingCostTemplate(
  apartmentId: string,
  name: string,
  isVariable: boolean,
  unit?: string | null,
  defaultAmount?: number,
) {
  ensureOperatingCostTables();
  const id = uuidv4();
  exec(
    `INSERT INTO op_cost_templates (id, apartment_id, name, is_variable, unit, default_amount)
        VALUES (?,?,?,?,?,?)`,
    [id, apartmentId, name, isVariable ? 1 : 0, unit ?? null, Number(defaultAmount || 0)],
  );
  return id;
}

export function replaceOperatingCostTemplates(
  apartmentId: string,
  items: Array<{ name: string; isVariable: boolean; unit?: string; defaultAmount?: number }>,
) {
  ensureOperatingCostTables();
  exec(`DELETE FROM op_cost_templates WHERE apartment_id=?`, [apartmentId]);
  for (const it of items) {
    upsertOperatingCostTemplate(
      apartmentId,
      it.name.trim(),
      !!it.isVariable,
      it.unit ?? null,
      Number(it.defaultAmount || 0),
    );
  }
}

export function listOperatingCostMonths(apartmentId: string) {
  ensureOperatingCostTables();
  return query<any>(
    `SELECT * FROM op_cost_months WHERE apartment_id=? ORDER BY ym DESC`,
    [apartmentId],
  );
}

/** CHỈ tạo row tháng nếu chưa có, KHÔNG seed items */
function ensureOperatingCostMonthRow(apartmentId: string, ym: string) {
  ensureOperatingCostTables();
  let m = query<any>(
    `SELECT * FROM op_cost_months WHERE apartment_id=? AND ym=? LIMIT 1`,
    [apartmentId, ym],
  )[0];
  if (!m) {
    const mid = uuidv4();
    exec(`INSERT INTO op_cost_months (id, apartment_id, ym) VALUES (?,?,?)`, [mid, apartmentId, ym]);
    m = query<any>(`SELECT * FROM op_cost_months WHERE id=?`, [mid])[0];
  }
  return m;
}

/** Tạo tháng + seed items theo template (chỉ gọi khi user CHỌN thêm tháng) */
export function ensureOperatingCostMonth(apartmentId: string, ym: string) {
  ensureOperatingCostTables();
  // month row
  let m = query<any>(
    `SELECT * FROM op_cost_months WHERE apartment_id=? AND ym=? LIMIT 1`,
    [apartmentId, ym],
  )[0];
  if (!m) {
    const mid = uuidv4();
    exec(`INSERT INTO op_cost_months (id, apartment_id, ym) VALUES (?,?,?)`, [mid, apartmentId, ym]);
    m = query<any>(`SELECT * FROM op_cost_months WHERE id=?`, [mid])[0];
    // seed items from templates
    const tpls = listOperatingCostTemplates(apartmentId);
    for (const t of tpls) {
      const iid = uuidv4();
      exec(
        `INSERT INTO op_cost_items (id, month_id, name, is_variable, unit, amount)
            VALUES (?,?,?,?,?,?)`,
        [iid, m.id, t.name, t.is_variable ? 1 : 0, t.unit ?? null, t.is_variable ? 0 : Number(t.default_amount) || 0],
      );
    }
  }
  return m;
}

/** Đọc tháng: KHÔNG tự tạo mới nếu chưa có */
export function getOperatingMonth(apartmentId: string, ym: string) {
  ensureOperatingCostTables();
  const m = query<any>(
    `SELECT * FROM op_cost_months WHERE apartment_id=? AND ym=? LIMIT 1`,
    [apartmentId, ym],
  )[0];

  if (!m) return { month: null, items: [] };

  const items = query<any>(
    `SELECT * FROM op_cost_items WHERE month_id=? ORDER BY is_variable ASC, name ASC`,
    [m.id],
  );
  return { month: m, items };
}

/** Lưu tháng: KHÔNG seed — chỉ đảm bảo có row tháng */
export function saveOperatingMonth(
  apartmentId: string,
  ym: string,
  items: Array<{ id?: string; name: string; is_variable: number; unit?: string | null; amount: number }>,
) {
  ensureOperatingCostTables();
  const m = ensureOperatingCostMonthRow(apartmentId, ym); // không seed
  // Chiến lược đơn giản: xóa & ghi lại theo payload (giữ id cũ nếu có cũng ok)
  exec(`DELETE FROM op_cost_items WHERE month_id=?`, [m.id]);
  for (const it of items) {
    const iid = it.id || uuidv4();
    exec(
      `INSERT INTO op_cost_items (id, month_id, name, is_variable, unit, amount)
          VALUES (?,?,?,?,?,?)`,
      [iid, m.id, it.name.trim(), Number(it.is_variable) || 0, it.unit ?? null, Number(it.amount) || 0],
    );
  }
}

/** Xoá 1 tháng vận hành (op_cost_*) */
export function deleteOperatingCostMonth(apartmentId: string, ym: string) {
  ensureOperatingCostTables();
  const m = query<any>(
    `SELECT id FROM op_cost_months WHERE apartment_id=? AND ym=? LIMIT 1`,
    [apartmentId, ym],
  )[0];
  if (!m) return;
  exec(`DELETE FROM op_cost_items  WHERE month_id=?`, [m.id]);
  exec(`DELETE FROM op_cost_months WHERE id=?`, [m.id]);
}

/** Reseed một tháng theo template hiện tại */
export function reseedOperatingCostMonthFromTemplates(apartmentId: string, ym: string) {
  ensureOperatingCostTables();
  const m = ensureOperatingCostMonthRow(apartmentId, ym);
  exec(`DELETE FROM op_cost_items WHERE month_id=?`, [m.id]);
  const tpls = listOperatingCostTemplates(apartmentId);
  for (const t of tpls) {
    const iid = uuidv4();
    exec(
      `INSERT INTO op_cost_items (id, month_id, name, is_variable, unit, amount)
       VALUES (?,?,?,?,?,?)`,
      [iid, m.id, t.name, t.is_variable ? 1 : 0, t.unit ?? null, t.is_variable ? 0 : Number(t.default_amount) || 0],
    );
  }
}

// Utilities
export function monthLabel(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ===== Misc lease helpers =====
export function closeExpiredLeases() {
  const t0 = new Date();
  const today = `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(2, '0')}-${String(
    t0.getDate(),
  ).padStart(2, '0')}`;
  const expired = query<any>(
    `
    SELECT l.id, l.room_id FROM leases l
    WHERE l.status='active' AND l.end_date IS NOT NULL AND l.end_date < ?`,
    [today],
  );
  for (const row of expired) {
    exec(`UPDATE leases SET status='ended' WHERE id=?`, [row.id]);
    if (row.room_id) exec(`UPDATE rooms SET status='available' WHERE id=? AND status!='available'`, [row.room_id]);
  }
}

export function ensureLeaseCollectColumn() {
  try {
    exec(`ALTER TABLE leases ADD COLUMN base_rent_collect TEXT DEFAULT 'start'`);
  } catch {}
}

export function isLastCycle(cycleId: string) {
  const c = getCycle(cycleId);
  if (!c) return false;
  const lease = getLease(c.lease_id);
  if (!lease) return false;

  if (lease.end_date) {
    // chu kỳ cuối nếu period_end >= end_date
    return c.period_end >= lease.end_date;
  }
  const more =
    query<{ cnt: number }>(
      `
    SELECT COUNT(*) cnt
    FROM lease_cycles
    WHERE lease_id = ? AND period_start > ?
  `,
      [lease.id, c.period_end],
    )[0]?.cnt ?? 0;

  return more === 0;
}

/** Prefill tạo HĐ mới khi “duy trì hợp đồng” */
export function getLeaseTemplateForRenew(leaseId: string) {
  const lease = getLease(leaseId);
  if (!lease) throw new Error('Lease not found');

  const charges = listChargesForLease(leaseId) as any[];

  return {
    roomId: lease.room_id,
    leaseType: 'long_term' as const,
    billing: lease.billing_cycle as 'monthly' | 'daily',
    startDateISO: lease.end_date || lease.start_date,
    baseRent: Number(lease.base_rent || 0),
    baseRentCollect: (lease.base_rent_collect || 'start') as 'start' | 'end',
    deposit: 0,
    durationDays: lease.billing_cycle === 'daily' ? lease.duration_days || 1 : undefined,
    endDateISO: undefined,
    charges: charges.map((r: any) => {
      const isVar = Number(r.is_variable) === 1;
      return {
        name: r.name,
        type: isVar ? 'variable' : 'fixed',
        unit: r.unit || (isVar ? t('rent.unit') : t('rent.month')),
        unitPrice: Number(r.unit_price) || 0,
        meterStart: isVar ? Number(r.meter_start || 0) : undefined,
      };
    }),
    tenant: lease.tenant_id ? getTenant(lease.tenant_id) : undefined,
  };
}

/**
 * Quyết toán cọc khi KẾT THÚC hợp đồng:
 * - adjustments: các khoản phát sinh (dương = trừ vào cọc; âm = hoàn/bù thêm)
 * - Trả về {deposit, adjustmentsTotal, finalBalance}
 *   finalBalance > 0  => trả lại khách
 *   finalBalance < 0  => cần thu thêm của khách (giá trị tuyệt đối)
 * Đồng thời: set lease = ended, room = available, lưu bản ghi vào lease_settlements.
 */
export function endLeaseWithSettlement(
  leaseId: string,
  adjustments: Array<{ name: string; amount: number }>,
) {
  const lease = getLease(leaseId);
  if (!lease) throw new Error('Lease not found');

  const deposit = Number(lease.deposit_amount || 0);
  const adjustmentsTotal = (adjustments || []).reduce(
    (s, it) => s + (Number(it.amount) || 0),
    0,
  );
  const finalBalance = deposit - adjustmentsTotal;

  // Đánh dấu kết thúc hợp đồng & trả phòng
  exec(`UPDATE leases SET status = 'ended' WHERE id = ?`, [leaseId]);
  if (lease.room_id) {
    exec(`UPDATE rooms SET status = 'available' WHERE id = ?`, [lease.room_id]);
  }

  // Lưu quyết toán
  ensureSettlementTable();
  const sid = uuidv4();
  exec(
    `INSERT INTO lease_settlements
      (id, lease_id, settled_at, deposit, adjustments_total, final_balance, details_json)
     VALUES (?,?,?,?,?,?,?)`,
    [sid, leaseId, new Date().toISOString(), deposit, adjustmentsTotal, finalBalance, JSON.stringify(adjustments || [])],
  );

  return { deposit, adjustmentsTotal, finalBalance };
}

export function hasUnpaidCycles(leaseId: string) {
  const row = query<{ cnt: number }>(
    `
    SELECT COUNT(*) AS cnt
    FROM lease_cycles c
    LEFT JOIN invoices i ON i.id = c.invoice_id
    WHERE c.lease_id = ?
      AND (
            c.status != 'settled'
         OR (i.id IS NOT NULL AND i.status != 'paid')
      )
  `,
    [leaseId],
  )[0];

  return (row?.cnt ?? 0) > 0;
}

/** Có thể kết thúc ngay không?
 * - Nếu hôm nay nằm trong một kỳ chưa tất toán → không cho kết thúc
 * - Các kỳ tương lai chưa tất toán sẽ bị xoá để có thể kết thúc
 */
export function canEndLeaseNow(leaseId: string) {
  const today = toYMD(new Date());
  const cycles = listCycles(leaseId);

  for (const c of cycles) {
    if (c.status !== 'settled') {
      if (today >= c.period_start && today <= c.period_end) {
        return { ok: false, reason: 'current_cycle' };
      }
      if (c.period_start > today) {
        exec(`DELETE FROM lease_cycles WHERE id=?`, [c.id]);
      }
    }
  }
  return { ok: true };
}

function ensureSettlementTable() {
  exec(`
    CREATE TABLE IF NOT EXISTS lease_settlements (
      id TEXT PRIMARY KEY,
      lease_id TEXT NOT NULL,
      settled_at TEXT NOT NULL,
      deposit INTEGER NOT NULL,
      adjustments_total INTEGER NOT NULL,
      final_balance INTEGER NOT NULL,
      details_json TEXT
    )
  `);
}

// Tiện ích: trả về danh sách phụ phí đã nhập khi kết thúc (đọc từ details_json)
export function listSettlementAdjustments(leaseId: string) {
  const row = getLeaseSettlement(leaseId);
  try {
    const arr = row?.details_json ? JSON.parse(row.details_json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function listLeasesByRoom(roomId: string) {
  return query(`SELECT * FROM leases WHERE room_id = ? ORDER BY start_date DESC`, [roomId]);
}

export function getLeaseSettlement(leaseId: string) {
  ensureSettlementTable();
  return query(
    `SELECT * FROM lease_settlements WHERE lease_id = ? ORDER BY settled_at DESC LIMIT 1`,
    [leaseId],
  )[0];
}

// ====== Operating costs (legacy operating_* tables) ======
type OperatingExpense = { name: string; amount: number; type: 'fixed' | 'variable'; note?: string };

export function ensureOperatingTables() {
  exec(`CREATE TABLE IF NOT EXISTS apartment_meta(
    apartment_id TEXT PRIMARY KEY,
    created_ym TEXT
  )`);
  exec(`CREATE TABLE IF NOT EXISTS operating_months(
    id TEXT PRIMARY KEY,
    apartment_id TEXT NOT NULL,
    ym TEXT NOT NULL,                    -- 'YYYY-MM'
    UNIQUE(apartment_id, ym)
  )`);
  exec(`CREATE TABLE IF NOT EXISTS operating_expenses(
    id TEXT PRIMARY KEY,
    apartment_id TEXT NOT NULL,
    ym TEXT NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,                  -- 'fixed' | 'variable'
    note TEXT
  )`);
  exec(`CREATE TABLE IF NOT EXISTS operating_fixed_templates(
    id TEXT PRIMARY KEY,
    apartment_id TEXT NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL
  )`);
}

export function listRoomsWithApartment() {
  return query(`
    SELECT r.*, a.name AS apartment_name, a.address
    FROM rooms r
    JOIN apartments a ON a.id = r.apartment_id
    ORDER BY r.code ASC
  `);
}

export function getApartmentStats() {
  const apt = query<any>(`SELECT id, name, address FROM apartments ORDER BY rowid ASC LIMIT 1`)[0];
  if (!apt) return null;
  const total =
    query<{ c: number }>(`SELECT COUNT(*) c FROM rooms WHERE apartment_id=?`, [apt.id])[0]?.c ?? 0;
  const occupied =
    query<{ c: number }>(
      `SELECT COUNT(*) c FROM rooms WHERE apartment_id=? AND status='occupied'`,
      [apt.id],
    )[0]?.c ?? 0;
  const available = total - occupied;
  return { apartment_id: apt.id, name: apt.name, address: apt.address, total, occupied, available };
}

function ymOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function listOperatingMonths(apartmentId: string): string[] {
  ensureOperatingTables();
  // bắt đầu từ tháng tạo apartment (fallback: tháng đầu tiên có phòng)
  let startRow = query<any>(`SELECT created_at FROM apartments WHERE id=?`, [apartmentId])[0];
  let start: string | null = null;
  if (startRow?.created_at) {
    start = startRow.created_at.slice(0, 7);
  } else {
    const anyRoom = query<any>(
      `SELECT created_at FROM rooms WHERE apartment_id=? ORDER BY created_at ASC LIMIT 1`,
      [apartmentId],
    )[0];
    start = anyRoom?.created_at ? String(anyRoom.created_at).slice(0, 7) : ymOf(new Date());
  }

  // generate list từ start đến tháng hiện tại (desc)
  const arr: string[] = [];
  const s = start!;
  const [sy, sm] = s.split('-').map((x: string) => Number(x));
  const cur = new Date();
  let y = sy,
    m = sm;
  while (y < cur.getFullYear() || (y === cur.getFullYear() && m <= cur.getMonth() + 1)) {
    arr.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return arr.reverse();
}

export function ensureOperatingMonth(apartmentId: string, ym: string) {
  ensureOperatingTables();
  const exist =
    query<{ c: number }>(
      `SELECT COUNT(*) c FROM operating_months WHERE apartment_id=? AND ym=?`,
      [apartmentId, ym],
    )[0]?.c ?? 0;
  if (exist > 0) return;
  const id = uuidv4();
  exec(`INSERT INTO operating_months (id, apartment_id, ym) VALUES (?,?,?)`, [id, apartmentId, ym]);

  // auto add fixed templates
  const tpls = query<any>(`SELECT * FROM operating_fixed_templates WHERE apartment_id=?`, [
    apartmentId,
  ]);
  for (const t of tpls) {
    const eid = uuidv4();
    exec(
      `INSERT INTO operating_expenses (id, apartment_id, ym, name, amount, type)
          VALUES (?,?,?,?,?, 'fixed')`,
      [eid, apartmentId, ym, t.name, t.amount],
    );
  }
}

export function listOperatingExpenses(apartmentId: string, ym: string) {
  ensureOperatingTables();
  return query(
    `SELECT * FROM operating_expenses WHERE apartment_id=? AND ym=? ORDER BY rowid ASC`,
    [apartmentId, ym],
  );
}

export function addOperatingExpense(apartmentId: string, ym: string, exp: OperatingExpense) {
  ensureOperatingMonth(apartmentId, ym);
  const id = uuidv4();
  exec(
    `INSERT INTO operating_expenses (id, apartment_id, ym, name, amount, type, note)
        VALUES (?,?,?,?,?,?,?)`,
    [id, apartmentId, ym, exp.name, exp.amount, exp.type, exp.note ?? null],
  );
}

export function listFixedExpenseTemplates(apartmentId: string) {
  ensureOperatingTables();
  return query(
    `SELECT * FROM operating_fixed_templates WHERE apartment_id=? ORDER BY rowid ASC`,
    [apartmentId],
  );
}
export function addFixedExpenseTemplate(apartmentId: string, tpl: { name: string; amount: number }) {
  ensureOperatingTables();
  const id = uuidv4();
  exec(
    `INSERT INTO operating_fixed_templates (id, apartment_id, name, amount) VALUES (?,?,?,?)`,
    [id, apartmentId, tpl.name, tpl.amount],
  );
}
export function removeFixedExpenseTemplate(id: string) {
  ensureOperatingTables();
  exec(`DELETE FROM operating_fixed_templates WHERE id=?`, [id]);
}

// ====== Reports (revenue by room, expenses) ======
export function getReportRevenueByRoom(apartmentId: string, start: string, end: string) {
  // Sum invoices.total theo phòng trong khoảng issue_date
  const rows = query<any>(
    `
    SELECT r.id AS room_id, r.code, SUM(i.total) AS total
    FROM invoices i
    JOIN leases l ON l.id = i.lease_id
    JOIN rooms r ON r.id = l.room_id
    WHERE r.apartment_id = ?
      AND i.issue_date >= ?
      AND i.issue_date <= ?
    GROUP BY r.id, r.code
    ORDER BY r.code ASC
  `,
    [apartmentId, start, end],
  );
  const total = rows.reduce((s: any, x: any) => s + (Number(x.total) || 0), 0);
  return { rows, total };
}

export function getReportOperatingExpenses(apartmentId: string, start: string, end: string) {
  ensureOperatingTables();
  // gom theo ym trong range
  const rows = query<any>(
    `
    SELECT ym, name, amount
    FROM operating_expenses
    WHERE apartment_id = ?
      AND ym >= substr(?,1,7)
      AND ym <= substr(?,1,7)
    ORDER BY ym ASC, rowid ASC
  `,
    [apartmentId, start, end],
  ).map((x: any) => ({ ...x, amount: Number(x.amount) || 0 }));
  const total = rows.reduce((s: any, x: any) => s + x.amount, 0);
  return { rows, total };
}
export function upsertRecurringChargeForLease(
  leaseId: string,
  item: { name: string; isVariable: boolean; unit?: string; price: number; meterStart?: number },
) {
  // 1) Bảo đảm có charge_type id (dùng upsert theo NAME)
  const ctId = addCustomChargeType(item.name, item.isVariable, item.unit, item.price);

  // 2) Kiểm tra lease đã có dòng recurring_charges cho ctId chưa
  const exist = query<{ id: string }>(
    `SELECT id FROM recurring_charges WHERE lease_id=? AND charge_type_id=? LIMIT 1`,
    [leaseId, ctId],
  )[0];

  const cfg = item.isVariable ? JSON.stringify({ meter_start: Number(item.meterStart || 0) }) : null;

  if (exist) {
    exec(
      `UPDATE recurring_charges SET unit_price=?, is_variable=?, config_json=? WHERE id=?`,
      [item.price ?? 0, item.isVariable ? 1 : 0, cfg, exist.id],
    );
    return exist.id;
  }

  // 3) Chưa có thì chèn mới
  return addRecurringCharge(
    leaseId,
    ctId,
    item.price,
    item.isVariable ? 1 : 0,
    item.isVariable ? { meter_start: item.meterStart || 0 } : undefined,
  );
}
export function addOrUpdateRecurringCharges(
  leaseId: string,
  items: Array<{ name: string; isVariable: boolean; unit?: string; price: number; meterStart?: number }>,
) {
  for (const it of items) upsertRecurringChargeForLease(leaseId, it);
}
export function updateTenant(
  tenantId: string,
  fields: { full_name?: string; phone?: string; id_number?: string; note?: string }
) {
  const cur = getTenant(tenantId);
  if (!cur) throw new Error('Tenant not found');

  // ✅ chỉ dùng ??, không trộn với ||
  const full_name = (fields.full_name ?? cur.full_name ?? '').trim();
  if (!full_name) throw new Error('FULL_NAME_REQUIRED');

  const phone = (fields.phone ?? cur.phone ?? null) as any;
  const id_number = (fields.id_number ?? cur.id_number ?? null) as any;
  const note = (fields.note ?? cur.note ?? null) as any;

  exec(
    `UPDATE tenants SET full_name = ?, phone = ?, id_number = ?, note = ? WHERE id = ?`,
    [full_name, phone, id_number, note, tenantId]
  );
  return getTenant(tenantId);
}
export function deleteTenant(tenantId: string) {
  // Chặn xóa nếu còn hợp đồng active
  const active =
    query<{ c: number }>(`SELECT COUNT(*) c FROM leases WHERE tenant_id = ? AND status = 'active'`, [
      tenantId,
    ])[0]?.c ?? 0;
  if (active > 0) {
    throw new Error('Người thuê đang có hợp đồng hoạt động.');
  }
  // Xóa người thuê; dữ liệu lease đã kết thúc (ended) vẫn giữ để lưu lịch sử
  exec(`DELETE FROM tenants WHERE id = ?`, [tenantId]);
}
export function totalOperatingExpenseByMonth(year: number, month: number) {
  ensureOperatingTables();
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const row = query<{ sum: number }>(
    `SELECT SUM(amount) AS sum FROM operating_expenses WHERE ym = ?`,
    [ym],
  )[0];
  return Number(row?.sum || 0);
}

export function listYearsWithData(): number[] {
  // gom năm từ invoices.issue_date và operating_expenses.ym
  const inv = query<{ y: number }>(
    `SELECT DISTINCT CAST(strftime('%Y', issue_date) AS INTEGER) AS y FROM invoices WHERE issue_date IS NOT NULL ORDER BY y ASC`,
  )
    .map(x => Number(x.y))
    .filter(Boolean);

  const opex = query<{ y: number }>(
    `SELECT DISTINCT CAST(substr(ym,1,4) AS INTEGER) AS y FROM operating_expenses ORDER BY y ASC`,
  )
    .map(x => Number(x.y))
    .filter(Boolean);

  const all = Array.from(new Set([...inv, ...opex]));
  if (all.length === 0) return [new Date().getFullYear()];
  return all.sort((a, b) => a - b);
}

// Breakdown theo căn hộ cho 1 tháng (YYYY, M)
export function listApartments() {
  return query<any>(`SELECT id, name, address FROM apartments ORDER BY name ASC`);
}

export function revenueByApartmentForMonth(apartmentId: string, year: number, month: number) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  // tổng theo căn hộ, join invoices -> leases -> rooms
  const row = query<{ sum: number }>(
    `
    SELECT SUM(i.total) AS sum
    FROM invoices i
    JOIN leases l ON l.id = i.lease_id
    JOIN rooms r ON r.id = l.room_id
    WHERE r.apartment_id = ?
      AND strftime('%Y-%m', i.issue_date) = ?
  `,
    [apartmentId, ym],
  )[0];
  return Number(row?.sum || 0);
}

export function expenseByApartmentForMonth(apartmentId: string, year: number, month: number) {
  ensureOperatingTables();
  ensureOperatingCostTables();
  const ym = `${year}-${String(month).padStart(2, '0')}`;

  const row = query<{ sum: number }>(
    `
    SELECT SUM(expense) AS sum
    FROM (
      -- nguồn 1: operating_expenses
      SELECT SUM(amount) AS expense
      FROM operating_expenses
      WHERE apartment_id = ? AND ym = ?
      UNION ALL
      -- nguồn 2: op_cost_* (tháng vận hành theo mẫu)
      SELECT SUM(oi.amount) AS expense
      FROM op_cost_items oi
      JOIN op_cost_months om ON om.id = oi.month_id
      WHERE om.apartment_id = ? AND om.ym = ?
    )
    `,
    [apartmentId, ym, apartmentId, ym],
  )[0];

  return Number(row?.sum || 0);
}

export function revenueByApartmentMonth(apartmentId: string, year: number, month: number) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const row = query<{ sum: number }>(
    `
    SELECT SUM(i.total) sum
    FROM invoices i
    JOIN leases l ON l.id = i.lease_id
    JOIN rooms r ON r.id = l.room_id
    WHERE r.apartment_id = ?
      AND strftime('%Y-%m', i.issue_date) = ?
  `,
    [apartmentId, ym],
  )[0];
  return Number(row?.sum || 0);
}

export function expensesByApartmentMonth(apartmentId: string, year: number, month: number) {
  // alias cho hàm trên (nếu nơi khác đang gọi)
  return expenseByApartmentForMonth(apartmentId, year, month);
}

export function revenueAllApartmentsByMonth(year: number) {
  // trả về mảng 12 phần tử tổng doanh thu toàn bộ căn hộ theo từng tháng
  const arr: number[] = [];
  for (let m = 1; m <= 12; m++) {
    arr.push(revenueByMonth(year, m));
  }
  return arr;
}
export function revenueAndExpenseByApartmentForMonth(year: number, month: number) {
  ensureOperatingTables();
  ensureOperatingCostTables();

  const ym = `${year}-${String(month).padStart(2, '0')}`;

  // Doanh thu theo apartment (invoices.total)
  const revenue = query<any>(
    `
    SELECT a.id AS apartment_id, a.name, SUM(i.total) AS revenue
    FROM invoices i
    JOIN leases  l ON l.id = i.lease_id
    JOIN rooms   r ON r.id = l.room_id
    JOIN apartments a ON a.id = r.apartment_id
    WHERE strftime('%Y-%m', i.issue_date) = ?
    GROUP BY a.id, a.name
    ORDER BY a.name ASC
    `,
    [ym],
  ).map(x => ({ ...x, revenue: Number(x.revenue || 0) }));

  // Chi phí theo apartment: GỘP 2 nguồn và SUM lại
  const expenses = query<any>(
    `
    SELECT apartment_id, SUM(expense) AS expense FROM (
      -- nguồn 1
      SELECT apartment_id, SUM(amount) AS expense
      FROM operating_expenses
      WHERE ym = ?
      GROUP BY apartment_id
      UNION ALL
      -- nguồn 2
      SELECT om.apartment_id AS apartment_id, SUM(oi.amount) AS expense
      FROM op_cost_items oi
      JOIN op_cost_months om ON om.id = oi.month_id
      WHERE om.ym = ?
      GROUP BY om.apartment_id
    )
    GROUP BY apartment_id
    `,
    [ym, ym],
  ).map(x => ({ apartment_id: x.apartment_id, expense: Number(x.expense || 0) }));

  // Gộp revenue + expense
  const map: Record<
    string,
    { apartment_id: string; name: string; revenue: number; expense: number; profit: number }
  > = {};

  for (const r of revenue) {
    map[r.apartment_id] = {
      apartment_id: r.apartment_id,
      name: r.name,
      revenue: r.revenue,
      expense: 0,
      profit: r.revenue,
    };
  }

  for (const e of expenses) {
    if (!map[e.apartment_id]) {
      // TH có chi phí mà không có doanh thu tháng đó
      const apt = query<any>(`SELECT name FROM apartments WHERE id=? LIMIT 1`, [e.apartment_id])[0];
      map[e.apartment_id] = {
        apartment_id: e.apartment_id,
        name: apt?.name || '—',
        revenue: 0,
        expense: 0,
        profit: 0,
      };
    }
    map[e.apartment_id].expense = e.expense;
    map[e.apartment_id].profit = (map[e.apartment_id].revenue || 0) - e.expense;
  }

  const rows = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  const totals = rows.reduce(
    (s, r) => ({
      revenue: s.revenue + r.revenue,
      expense: s.expense + r.expense,
      profit: s.profit + r.profit,
    }),
    { revenue: 0, expense: 0, profit: 0 },
  );

  return { rows, totals };
}

export function bootstrapRentModule() {
  try {
    ensureChargeTypesTable(); // bảng loại phí định kỳ
  } catch {}
  try {
    ensureOperatingTables(); // 4 bảng operating_* (months, expenses, templates, meta)
  } catch {}
}
