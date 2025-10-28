import { exec, query } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../utils/i18nProxy';

let __i18nMod: any;
try {
  __i18nMod = require('../i18n');
} catch {}

// ===== Types =====
type LeaseType = 'short_term' | 'long_term';
type Billing = 'daily' | 'monthly' | 'yearly';
type CollectWhen = 'start' | 'end';
export type FixedOrVariable = 'fixed' | 'variable';

// (optional) Invoice type for convenience
export type Invoice = {
  id: string;
  lease_id: string;
  period_start: string;
  period_end: string;
  issue_date?: string;
  subtotal: number;
  total: number;
  status: 'open' | 'partial' | 'paid';
  qr_png_path?: string | null; // ✅ VietQR image file path
  code?: string | null;
};

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
  tenant?: {
    full_name: string;
    phone?: string;
    id_number?: string;
    note?: string;
  };
};

type AddRecurringItem = {
  name: string;
  isVariable: boolean;
  unit?: string;
  price: number;
  meterStart?: number;
};

// ===== Dates helpers =====
const dayMs = 24 * 60 * 60 * 1000;
function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function monthBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0)); // last day of month
  return { start, end };
}
function toDateISO(s: string) {
  const [Y, M, D] = s.split('-').map(Number);
  return new Date(Date.UTC(Y, M - 1, D));
}
function daysInclusive(a: Date, b: Date) {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / dayMs) + 1);
}
function overlapDaysInclusive(a1: Date, a2: Date, b1: Date, b2: Date) {
  const s = new Date(Math.max(a1.getTime(), b1.getTime()));
  const e = new Date(Math.min(a2.getTime(), b2.getTime()));
  if (e.getTime() < s.getTime()) return 0;
  return daysInclusive(s, e);
}
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
  exec(`INSERT INTO apartments (id, name, address) VALUES (?,?,?)`, [
    id,
    name,
    address ?? null,
  ]);
  return id;
}
export function deleteApartment(apartmentId: string) {
  const rooms =
    query<{ c: number }>(
      `SELECT COUNT(*) c FROM rooms WHERE apartment_id = ?`,
      [apartmentId],
    )[0]?.c ?? 0;
  if (rooms > 0) throw new Error(t('rent.apartmentexistroom'));
  exec(`DELETE FROM apartments WHERE id = ?`, [apartmentId]);
}

export function createRoom(
  apartmentId: string,
  code: string,
  floor?: number,
  area?: number,
) {
  const norm = (code || '').trim();
  if (!norm) throw new Error('EMPTY_CODE');

  const exist =
    query<{ c: number }>(
      `SELECT COUNT(*) c FROM rooms WHERE apartment_id = ? AND lower(code) = lower(?)`,
      [apartmentId, norm],
    )[0]?.c ?? 0;

  if (exist > 0) {
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
export function createTenant(
  full_name: string,
  phone?: string,
  id_number?: string,
  note?: string,
) {
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
  const found = query<{ id: string }>(
    `SELECT id FROM charge_types WHERE name = ? LIMIT 1`,
    [name],
  )[0];
  if (found) {
    exec(
      `UPDATE charge_types SET unit=?, pricing_model=?, unit_price=?, meta_json=? WHERE id=?`,
      [
        unit || null,
        pricing_model,
        unit_price ?? null,
        JSON.stringify({ is_variable }),
        found.id,
      ],
    );
    return found.id;
  }
  const id = uuidv4();
  exec(
    `INSERT INTO charge_types (id,name,unit,pricing_model,unit_price,meta_json) VALUES (?,?,?,?,?,?)`,
    [
      id,
      name,
      unit || null,
      pricing_model,
      unit_price ?? null,
      JSON.stringify({ is_variable }),
    ],
  );
  return id;
}
export function addCustomChargeType(
  name: string,
  isVariable: boolean,
  unit?: string,
  defaultPrice?: number,
) {
  return upsertChargeType(
    name,
    unit,
    isVariable ? 'per_unit' : 'flat',
    defaultPrice,
    isVariable,
  );
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
  return query(
    `SELECT * FROM leases WHERE room_id=? AND status='active' LIMIT 1`,
    [roomId],
  )[0];
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
  if (tenant?.full_name) {
    tenantId = createTenant(
      tenant.full_name,
      tenant.phone,
      tenant.id_number,
      tenant.note,
    );
  }

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
      addRecurringCharge(
        id,
        ctId,
        ch.unitPrice ?? 0,
        ch.type === 'variable' ? 1 : 0,
        {
          meter_start: ch.type === 'variable' ? ch.meterStart ?? 0 : undefined,
        },
      );
    }
  }

  ensureCyclesForLease(id);

  if ((baseRentCollect || 'start') === 'start' && (Number(baseRent) || 0) > 0) {
    ensureOpeningCycleForLease(id);
  }

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
    [
      id,
      leaseId,
      chargeTypeId,
      unit_price ?? 0,
      is_variable ?? 0,
      cfg ? JSON.stringify(cfg) : null,
    ],
  );
  return id;
}

export function addCustomRecurringCharges(
  leaseId: string,
  items: AddRecurringItem[],
) {
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
      if (cfg && typeof cfg.meter_start === 'number')
        meter_start = cfg.meter_start;
      else if (cfg && typeof cfg.meterStart === 'number')
        meter_start = cfg.meterStart;
    } catch {}
    return { ...r, meter_start };
  });
}

export function updateRecurringChargePrice(
  leaseId: string,
  chargeTypeId: string,
  newPrice: number,
) {
  exec(
    `UPDATE recurring_charges SET unit_price=? WHERE lease_id=? AND charge_type_id=?`,
    [newPrice, leaseId, chargeTypeId],
  );
}

// ===== Cycles =====
export function listCycles(leaseId: string) {
  return query(
    `SELECT * FROM lease_cycles WHERE lease_id=? ORDER BY period_start ASC`,
    [leaseId],
  );
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

function insertCycle(
  leaseId: string,
  s: Date,
  e: Date,
  opts?: { opening?: boolean },
) {
  ensureLeaseCyclesOpeningColumn();
  const id = uuidv4();
  exec(
    `INSERT INTO lease_cycles (id, lease_id, period_start, period_end, due_date, status, is_opening)
     VALUES (?,?,?,?,?, 'open', ?)`,
    [id, leaseId, toYMD(s), toYMD(e), toYMD(e), opts?.opening ? 1 : 0],
  );
  return id;
}

function insertOpeningCycle(leaseId: string, day: Date) {
  ensureLeaseCyclesOpeningColumn();
  const id = uuidv4();
  exec(
    `INSERT INTO lease_cycles (id, lease_id, period_start, period_end, due_date, status, is_opening)
     VALUES (?,?,?,?,?, 'open', 1)`,
    [id, leaseId, toYMD(day), toYMD(day), toYMD(day)],
  );
  return id;
}

function ensureOpeningCycleForLease(leaseId: string) {
  ensureLeaseCyclesOpeningColumn();

  const l = getLease(leaseId);
  if (!l) return;

  const collect = (l.base_rent_collect || 'start') as 'start' | 'end';
  const base = Number(l.base_rent || 0);
  if (collect !== 'start' || base <= 0) return;

  const existed = query<{ id: string }>(
    `SELECT id FROM lease_cycles WHERE lease_id=? AND is_opening=1 LIMIT 1`,
    [leaseId],
  )[0];
  if (existed) return;

  const first = query<any>(
    `SELECT * FROM lease_cycles WHERE lease_id=? ORDER BY period_start ASC LIMIT 1`,
    [leaseId],
  )[0];
  if (!first) return;

  // Kỳ mở đầu = 1 ngày tại start_date
  const s = new Date(l.start_date);
  const ocId = insertCycle(leaseId, s, s, { opening: true });
  const inv = openInvoiceForCycle(ocId);

  // ✅ Thu đầu kỳ → ghi nhận cho KỲ KẾ TIẾP
  const nStart = addDays(new Date(first.period_end), 1);
  const nEnd = addDays(addMonths(nStart, 1), -1);
  const occS = new Date(l.start_date);
  const occE = l.end_date
    ? new Date(l.end_date)
    : addDays(new Date(first.period_end), 3650); // gần như vô hạn
  const baseAt = baseRentAtDate(leaseId, first.period_start);
  const prorated = proRateAmountForRange(
    Number(baseAt) || 0,
    toDateISO(first.period_start),
    toDateISO(first.period_end),
    occS,
    occE,
  );
  addInvoiceItem(
    inv.id,
    'rent.roomprice',
    1,
    'rent.month',
    base,
    base,
    undefined,
    {
      opening: true,
      base: true,
      cycle_of: 'current',
      for_period_start: first.period_start, // 01/10
      for_period_end: first.period_end, // 31/10
    },
  );

  recalcInvoice(inv.id);
  exec(`UPDATE lease_cycles SET status='settled' WHERE id=?`, [ocId]);
}

/** Tạo đầy đủ chu kỳ */
export function ensureCyclesForLease(leaseId: string) {
  const lease = getLease(leaseId);
  if (!lease) return;

  const existing =
    query<{ c: number }>(
      `SELECT COUNT(*) c FROM lease_cycles WHERE lease_id=?`,
      [leaseId],
    )[0]?.c ?? 0;
  if (existing > 0) return;

  const s0 = new Date(lease.start_date);

  if (lease.billing_cycle === 'daily') {
    const days = Math.max(1, Number(lease.duration_days || 1));
    const e0 = addDays(s0, days - 1);
    insertCycle(leaseId, s0, e0);
    return;
  }

  const endOfThisMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0,
  );

  const hardEnd = lease.end_date
    ? new Date(
        Math.min(new Date(lease.end_date).getTime(), endOfThisMonth.getTime()),
      )
    : endOfThisMonth;

  const firstEnd = addDays(addMonths(s0, 1), -1);
  if (s0 > hardEnd) {
    insertCycle(leaseId, s0, firstEnd);
    return;
  }

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

  const toY = (d: Date) => d.toISOString().slice(0, 10);
  const _addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const _addMonths = (d: Date, n: number) => {
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

  let start = _addDays(new Date(last.period_end), 1);

  if (String(lease.billing_cycle) === 'monthly') {
    const n = Math.max(1, Number(extraCount || 0));
    let end: Date = new Date(last.period_end);
    for (let i = 0; i < n; i++) {
      const e = _addDays(_addMonths(start, 1), -1);
      insertCycle(leaseId, start, e);
      end = e;
      start = _addDays(e, 1);
    }
    exec(`UPDATE leases SET end_date = ? WHERE id = ?`, [toY(end), leaseId]);
  } else {
    const days = Math.max(1, Number(extraCount || 0));
    const e = _addDays(start, days - 1);
    insertCycle(leaseId, start, e);
    exec(`UPDATE leases SET end_date = ? WHERE id = ?`, [toY(e), leaseId]);
  }
}

// ===== Invoices =====

// ✅ Ensure extra column(s) for invoices
function ensureInvoicesExtraColumns() {
  try {
    exec(`ALTER TABLE invoices ADD COLUMN qr_png_path TEXT`);
  } catch {}
  // (future-proof) If you later add code/notes, you can extend here similarly.
}

export function openInvoiceForCycle(cycleId: string) {
  ensureInvoicesExtraColumns(); // make sure columns exist
  const c = getCycle(cycleId);
  if (!c) throw new Error('Cycle not found');
  if (c.invoice_id)
    return query(`SELECT * FROM invoices WHERE id=?`, [c.invoice_id])[0];
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
  ensureInvoicesExtraColumns();
  return query(`SELECT * FROM invoices WHERE id=?`, [id])[0] as Invoice;
}
export function getInvoiceItems(invoiceId: string) {
  return query(
    `SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY rowid ASC`,
    [invoiceId],
  );
}

/** ✅ VietQR: cập nhật đường dẫn ảnh QR đã render */
export function updateInvoiceQrPath(invoiceId: string, path: string) {
  ensureInvoicesExtraColumns();
  exec(`UPDATE invoices SET qr_png_path = ? WHERE id = ?`, [path, invoiceId]);
}

function seedFirstMonthBaseRentIfNeeded(leaseId: string) {
  const l = getLease(leaseId);
  if (!l) return;
  const collect = (l.base_rent_collect || 'start') as 'start' | 'end';
  const base = Number(l.base_rent || 0);
  if (collect !== 'start' || base <= 0) return;

  const first = query<any>(
    `SELECT * FROM lease_cycles WHERE lease_id=? ORDER BY period_start ASC LIMIT 1`,
    [leaseId],
  )[0];
  if (!first) return;

  const existed =
    query<{ c: number }>(
      `
      SELECT COUNT(*) AS c
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.lease_id = ?
        AND ii.description IN ('rent.roomprice', ?)
        AND json_extract(ii.meta_json,'$.for_period_start') = ?
        AND json_extract(ii.meta_json,'$.for_period_end')   = ?
      `,
      [leaseId, t('rent.roomprice'), first.period_start, first.period_end],
    )[0]?.c ?? 0;
  if (existed > 0) return;

  const inv = openInvoiceForCycle(first.id);
  addInvoiceItem(
    inv.id,
    'rent.roomprice',
    1,
    'rent.month',
    base,
    base,
    undefined,
    {
      opening: true,
      base: true,
      cycle_of: 'current',
      for_period_start: first.period_start,
      for_period_end: first.period_end,
    },
  );
  recalcInvoice(inv.id);

  dedupeBaseRentItems(inv.id);
}
function dedupeBaseRentItems(invoiceId: string) {
  const items = getInvoiceItems(invoiceId) as any[];
  const map: Record<string, string[]> = {};

  for (const it of items) {
    const desc = String(it.description || '');
    const isBase =
      desc === 'rent.roomprice' ||
      desc === t('rent.roomprice') ||
      desc === (t('leaseForm.baseRent') || '');
    if (!isBase) continue;

    let key = '';
    try {
      const m = it.meta_json ? JSON.parse(it.meta_json) : null;
      if (m?.for_period_start && m?.for_period_end) {
        key = `${m.for_period_start}__${m.for_period_end}`;
      }
    } catch {}
    if (!key) continue;

    if (!map[key]) map[key] = [];
    map[key].push(it.id);
  }

  for (const ids of Object.values(map)) {
    if (ids.length <= 1) continue;
    for (let i = 1; i < ids.length; i++) {
      exec(`DELETE FROM invoice_items WHERE id = ?`, [ids[i]]);
    }
  }
  recalcInvoice(invoiceId);
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
    query<{ sum: number }>(
      `SELECT SUM(amount) sum FROM invoice_items WHERE invoice_id=?`,
      [invoiceId],
    )[0]?.sum ?? 0;
  exec(
    `UPDATE invoices SET subtotal=?, total=?, status = CASE WHEN total>0 THEN status ELSE 'open' END WHERE id=?`,
    [sum, sum, invoiceId],
  );
}
export function recordPayment(
  invoiceId: string,
  amount: number,
  method: string,
) {
  const id = uuidv4();
  exec(
    `INSERT INTO payments (id, invoice_id, payment_date, amount, method) VALUES (?,?,?,?,?)`,
    [id, invoiceId, toYMD(new Date()), amount, method],
  );
  const inv = getInvoice(invoiceId);
  const paid =
    query<{ sum: number }>(
      `SELECT SUM(amount) sum FROM payments WHERE invoice_id=?`,
      [invoiceId],
    )[0]?.sum ?? 0;
  exec(`UPDATE invoices SET status=? WHERE id=?`, [
    paid >= inv.total ? 'paid' : 'partial',
    invoiceId,
  ]);
}

export function settleCycleWithInputs(
  cycleId: string,
  variableInputs: Array<{
    charge_type_id: string;
    quantity: number;
    meter_end?: number;
    meta_extra?: any;  
  }>,
  extraCosts: Array<{ name: string; amount: number }> = [],
) {
  const c = getCycle(cycleId);
  if (!c) throw new Error('Cycle not found');
  const inv = openInvoiceForCycle(cycleId);
  const lease = getLease(inv.lease_id);

  const collectWhen: 'start' | 'end' = (lease?.base_rent_collect ||
    'start') as any;
  const base = Number(lease?.base_rent || 0);

  const endCur = new Date(c.period_end);
  const nextStart = addDays(endCur, 1);
  const nextEnd = addDays(addMonths(nextStart, 1), -1);
  if (base > 0) {
    if (collectWhen === 'end') {
      const occS = new Date(lease.start_date);
      const occE = lease.end_date
        ? new Date(lease.end_date)
        : addDays(new Date(c.period_end), 3650);
      const baseAt = baseRentAtDate(inv.lease_id, c.period_start);
      const prorated = proRateAmountForRange(
        Number(baseAt) || 0,
        toDateISO(c.period_start),
        toDateISO(c.period_end),
        occS,
        occE,
      );
      if (prorated > 0) {
        addInvoiceItem(
          inv.id,
          'rent.roomprice',
          1,
          'rent.month',
          prorated,
          prorated,
          undefined,
          {
            base: true,
            cycle_of: 'current',
            for_period_start: c.period_start,
            for_period_end: c.period_end,
          },
        );
      }
    } else {
      const last = isLastCycle(cycleId);
      if (!last) {
        const nStart = addDays(endCur, 1);
        const nEnd = addDays(addMonths(nStart, 1), -1);

        const occS = new Date(lease.start_date);
        const occE = lease.end_date
          ? new Date(lease.end_date)
          : addDays(nEnd, 3650);
        const baseAt = baseRentAtDate(inv.lease_id, toYMD(nStart));
        const prorated = proRateAmountForRange(
          Number(baseAt) || 0,
          nStart,
          nEnd,
          occS,
          occE,
        );

        if (prorated > 0) {
          addInvoiceItem(
            inv.id,
            'rent.roomprice',
            1,
            'rent.month',
            prorated,
            prorated,
            undefined,
            {
              base: true,
              cycle_of: 'next',
              for_period_start: toYMD(nStart),
              for_period_end: toYMD(nEnd),
            },
          );
        }
      }
    }
  }

  const charges = listChargesForLease(inv.lease_id);
  for (const ch of charges) {
    if (Number(ch.is_variable) === 1) continue;
    if (String(ch.name).toLowerCase() === t('rent.roomprice1')) continue;
    const price = Number(ch.unit_price) || 0;
    addInvoiceItem(
      inv.id,
      ch.name,
      1,
      ch.unit || t('rent.month'),
      price,
      price,
      ch.charge_type_id,
      {
        cycle_of: 'current',
        for_period_start: c.period_start,
        for_period_end: c.period_end,
      },
    );
  }

  for (const inp of variableInputs) {
    const ch = (charges as any[]).find(
      x => x.charge_type_id === inp.charge_type_id,
    );
    if (!ch) continue;
    const qty = Math.max(0, Number(inp.quantity) || 0);
    const price = Number(ch.unit_price) || 0;
    addInvoiceItem(
      inv.id,
      ch.name,
      qty,
      ch.unit,
      price,
      qty * price,
      ch.charge_type_id,
      {
        variable: true,
        meter_start: Number(ch.meter_start || 0),
        meter_end: Number(inp.meter_end || 0),
        cycle_of: 'current',
        for_period_start: c.period_start,
        for_period_end: c.period_end,
        ...(inp.meta_extra || {}) 
      },
    );
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

// Open-ended: luôn tạo kỳ kế tiếp.
// Fixed-term: chỉ tạo khi chưa phải kỳ cuối.
const openEnded =
  !lease.end_date &&
  !(lease.billing_cycle === 'daily' && Number(lease.duration_days || 0) > 0);

if (openEnded || !isLastCycle(cycleId)) {
  ensureNextCycleAfter(inv.lease_id, c.period_end);
}

  const items = getInvoiceItems(inv.id) as any[];
  const meterMap: Record<string, number> = {};
  for (const it of items) {
    if (it.charge_type_id && it.meta_json) {
      try {
        const m = JSON.parse(it.meta_json);
        if (typeof m?.meter_end === 'number')
          meterMap[it.charge_type_id] = m.meter_end;
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
    exec(
      `UPDATE recurring_charges SET config_json=? WHERE lease_id=? AND charge_type_id=?`,
      [JSON.stringify(cfg), inv.lease_id, ctId],
    );
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

/** ✅ NHẬN DIỆN ĐẶT CỌC LÚC KÝ HĐ (để loại khỏi báo cáo) */
function isContractDepositItem(row: any): boolean {
  // 1) meta flag có sẵn
  try {
    const m = row?.meta_json ? JSON.parse(row.meta_json) : null;
    if (
      m &&
      (m.deposit === true || m.type === 'deposit' || m.tag === 'deposit')
    )
      return true;
  } catch {}

  // 2) mô tả phải giống “đặt cọc”
  if (!looksLikeDepositDesc(row?.description)) return false;

  // 3) số tiền phải ≈ tiền cọc của hợp đồng
  const dep = Number(row?.lease_deposit || 0);
  const amt = Number(row?.amount || 0);
  if (dep <= 0) return false;
  const amtMatches = Math.abs(amt - dep) < 1; // dung sai 1đ
  if (!amtMatches) return false;

  // 4) so khớp theo KHOẢNG KỲ (ưu tiên for_period_* nếu có)
  const { ps, pe } = parseItemPeriod(row); // đã có sẵn phía dưới file
  const leaseStart = row?.lease_start ? toDateISO(row.lease_start) : null;
  if (!leaseStart) return false;

  const withinPeriod =
    leaseStart.getTime() >= ps.getTime() &&
    leaseStart.getTime() <= pe.getTime();

  const sameMonthAsPeriodStart =
    ps.getUTCFullYear() === leaseStart.getUTCFullYear() &&
    ps.getUTCMonth() === leaseStart.getUTCMonth();

  // fallback cũ: theo issue_date
  const issue = row?.issue_date ? toDateISO(row.issue_date) : null;
  const issueSameMonth =
    !!issue &&
    issue.getUTCFullYear() === leaseStart.getUTCFullYear() &&
    issue.getUTCMonth() === leaseStart.getUTCMonth();

  return withinPeriod || sameMonthAsPeriodStart || issueSameMonth;
}

// ===== Reports =====
export function revenueByMonth(year: number, month: number) {
  const { start: ms, end: me } = monthBounds(year, month);

  const items = query<any>(`
    SELECT ii.amount, ii.meta_json, ii.description,
           i.period_start, i.period_end,
           l.start_date AS lease_start,
           l.deposit_amount AS lease_deposit,
           l.base_rent_collect                -- cần cột này
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    JOIN leases   l ON l.id = i.lease_id
  `);

  let sum = 0;
  for (const it of items) {
    if (isContractDepositItem(it)) continue;

    const { ps, pe } = getRevenuePeriodForItem(it); // ⬅️ dùng helper
    const overlap = overlapDaysInclusive(ps, pe, ms, me);
    if (overlap <= 0) continue;

    const days = daysInclusive(ps, pe);
    sum += (Number(it.amount) || 0) * (overlap / days);
  }
  return Math.round(sum);
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
    query<{ c: number }>(`SELECT COUNT(*) c FROM charge_types`)[0]?.c ?? 0;
  if (c > 0) return;
  const defs = [
    {
      name: t('rent.carprice'),
      unit: t('rent.month'),
      pricing_model: 'flat',
      unit_price: 0,
    },
    {
      name: t('rent.internet'),
      unit: t('rent.month'),
      pricing_model: 'flat',
      unit_price: 0,
    },
    {
      name: t('rent.garbage'),
      unit: t('rent.month'),
      pricing_model: 'flat',
      unit_price: 0,
    },
    {
      name: t('rent.maintenance'),
      unit: t('rent.month'),
      pricing_model: 'flat',
      unit_price: 0,
    },
    {
      name: t('rent.security'),
      unit: t('rent.month'),
      pricing_model: 'flat',
      unit_price: 0,
    },
    {
      name: t('rent.electricity'),
      unit: 'kWh',
      pricing_model: 'per_unit',
      unit_price: 0,
      meta: { is_variable: true },
    },
    {
      name: t('rent.water'),
      unit: 'm3',
      pricing_model: 'per_unit',
      unit_price: 0,
      meta: { is_variable: true },
    },
  ] as any[];
  for (const d of defs) {
    exec(
      `INSERT INTO charge_types (id,name,unit,pricing_model,unit_price,meta_json) VALUES (?,?,?,?,?,?)`,
      [
        rid(),
        d.name,
        d.unit ?? null,
        d.pricing_model,
        d.unit_price ?? 0,
        d.meta ? JSON.stringify(d.meta) : null,
      ],
    );
  }
}

// ====== Operating Costs v2 ======
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
    query<{ c: number }>(
      `SELECT COUNT(*) c FROM op_cost_templates WHERE apartment_id=?`,
      [apartmentId],
    )[0]?.c ?? 0;
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
    [
      id,
      apartmentId,
      name,
      isVariable ? 1 : 0,
      unit ?? null,
      Number(defaultAmount || 0),
    ],
  );
  return id;
}

export function replaceOperatingCostTemplates(
  apartmentId: string,
  items: Array<{
    name: string;
    isVariable: boolean;
    unit?: string;
    defaultAmount?: number;
  }>,
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

/** CHỈ tạo row tháng nếu chưa có */
function ensureOperatingCostMonthRow(apartmentId: string, ym: string) {
  ensureOperatingCostTables();
  let m = query<any>(
    `SELECT * FROM op_cost_months WHERE apartment_id=? AND ym=? LIMIT 1`,
    [apartmentId, ym],
  )[0];
  if (!m) {
    const mid = uuidv4();
    exec(`INSERT INTO op_cost_months (id, apartment_id, ym) VALUES (?,?,?)`, [
      mid,
      apartmentId,
      ym,
    ]);
    m = query<any>(`SELECT * FROM op_cost_months WHERE id=?`, [mid])[0];
  }
  return m;
}

/** Tạo tháng + seed items theo template */
export function ensureOperatingCostMonth(apartmentId: string, ym: string) {
  ensureOperatingCostTables();
  let m = query<any>(
    `SELECT * FROM op_cost_months WHERE apartment_id=? AND ym=? LIMIT 1`,
    [apartmentId, ym],
  )[0];
  if (!m) {
    const mid = uuidv4();
    exec(`INSERT INTO op_cost_months (id, apartment_id, ym) VALUES (?,?,?)`, [
      mid,
      apartmentId,
      ym,
    ]);
    m = query<any>(`SELECT * FROM op_cost_months WHERE id=?`, [mid])[0];
    const tpls = listOperatingCostTemplates(apartmentId);
    for (const t of tpls) {
      const iid = uuidv4();
      exec(
        `INSERT INTO op_cost_items (id, month_id, name, is_variable, unit, amount)
            VALUES (?,?,?,?,?,?)`,
        [
          iid,
          m.id,
          t.name,
          t.is_variable ? 1 : 0,
          t.unit ?? null,
          t.is_variable ? 0 : Number(t.default_amount) || 0,
        ],
      );
    }
  }
  return m;
}

/** Đọc tháng */
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

/** Lưu tháng */
export function saveOperatingMonth(
  apartmentId: string,
  ym: string,
  items: Array<{
    id?: string;
    name: string;
    is_variable: number;
    unit?: string | null;
    amount: number;
  }>,
) {
  ensureOperatingCostTables();
  const m = ensureOperatingCostMonthRow(apartmentId, ym);
  exec(`DELETE FROM op_cost_items WHERE month_id=?`, [m.id]);
  for (const it of items) {
    const iid = it.id || uuidv4();
    exec(
      `INSERT INTO op_cost_items (id, month_id, name, is_variable, unit, amount)
          VALUES (?,?,?,?,?,?)`,
      [
        iid,
        m.id,
        it.name.trim(),
        Number(it.is_variable) || 0,
        it.unit ?? null,
        Number(it.amount) || 0,
      ],
    );
  }
}

/** Xoá 1 tháng vận hành */
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

/** Reseed tháng từ template */
export function reseedOperatingCostMonthFromTemplates(
  apartmentId: string,
  ym: string,
) {
  ensureOperatingCostTables();
  const m = ensureOperatingCostMonthRow(apartmentId, ym);
  exec(`DELETE FROM op_cost_items WHERE month_id=?`, [m.id]);
  const tpls = listOperatingCostTemplates(apartmentId);
  for (const t of tpls) {
    const iid = uuidv4();
    exec(
      `INSERT INTO op_cost_items (id, month_id, name, is_variable, unit, amount)
       VALUES (?,?,?,?,?,?)`,
      [
        iid,
        m.id,
        t.name,
        t.is_variable ? 1 : 0,
        t.unit ?? null,
        t.is_variable ? 0 : Number(t.default_amount) || 0,
      ],
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
  const today = `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(t0.getDate()).padStart(2, '0')}`;
  const expired = query<any>(
    `
    SELECT l.id, l.room_id FROM leases l
    WHERE l.status='active' AND l.end_date IS NOT NULL AND l.end_date < ?`,
    [today],
  );
  for (const row of expired) {
    exec(`UPDATE leases SET status='ended' WHERE id=?`, [row.id]);
    if (row.room_id)
      exec(
        `UPDATE rooms SET status='available' WHERE id=? AND status!='available'`,
        [row.room_id],
      );
  }
}

export function ensureLeaseCollectColumn() {
  try {
    exec(
      `ALTER TABLE leases ADD COLUMN base_rent_collect TEXT DEFAULT 'start'`,
    );
  } catch {}
}

export function isLastCycle(cycleId: string) {
  const c = getCycle(cycleId);
  if (!c) return false;
  const lease = getLease(c.lease_id);
  if (!lease) return false;

  // Fixed-term: có end_date -> kỳ cuối nếu period_end >= end_date
  if (lease.end_date) {
    return new Date(c.period_end).getTime() >= new Date(lease.end_date).getTime();
  }

  // Daily có duration cố định -> kỳ cuối khi đã chạm ngày cuối
  if (lease.billing_cycle === 'daily' && Number(lease.duration_days || 0) > 0) {
    const lastDay = addDays(new Date(lease.start_date), Math.max(1, Number(lease.duration_days || 0)) - 1);
    return new Date(c.period_end).getTime() >= lastDay.getTime();
  }

  // No term (không thời hạn): không bao giờ là kỳ cuối
  return false;
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
    durationDays:
      lease.billing_cycle === 'daily' ? lease.duration_days || 1 : undefined,
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
 * Quyết toán cọc khi KẾT THÚC hợp đồng
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

  exec(`UPDATE leases SET status = 'ended' WHERE id = ?`, [leaseId]);
  if (lease.room_id) {
    exec(`UPDATE rooms SET status = 'available' WHERE id = ?`, [lease.room_id]);
  }

  ensureSettlementTable();
  const sid = uuidv4();
  exec(
    `INSERT INTO lease_settlements
      (id, lease_id, settled_at, deposit, adjustments_total, final_balance, details_json)
     VALUES (?,?,?,?,?,?,?)`,
    [
      sid,
      leaseId,
      new Date().toISOString(),
      deposit,
      adjustmentsTotal,
      finalBalance,
      JSON.stringify(adjustments || []),
    ],
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

/** Có thể kết thúc ngay không? */
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
  return query(
    `SELECT * FROM leases WHERE room_id = ? ORDER BY start_date DESC`,
    [roomId],
  );
}

export function getLeaseSettlement(leaseId: string) {
  ensureSettlementTable();
  return query(
    `SELECT * FROM lease_settlements WHERE lease_id = ? ORDER BY settled_at DESC LIMIT 1`,
    [leaseId],
  )[0];
}

// ====== Operating costs (legacy) ======
type OperatingExpense = {
  name: string;
  amount: number;
  type: 'fixed' | 'variable';
  note?: string;
};

export function ensureOperatingTables() {
  exec(`CREATE TABLE IF NOT EXISTS apartment_meta(
    apartment_id TEXT PRIMARY KEY,
    created_ym TEXT
  )`);
  exec(`CREATE TABLE IF NOT EXISTS operating_months(
    id TEXT PRIMARY KEY,
    apartment_id TEXT NOT NULL,
    ym TEXT NOT NULL,
    UNIQUE(apartment_id, ym)
  )`);
  exec(`CREATE TABLE IF NOT EXISTS operating_expenses(
    id TEXT PRIMARY KEY,
    apartment_id TEXT NOT NULL,
    ym TEXT NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
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
  const apt = query<any>(
    `SELECT id, name, address FROM apartments ORDER BY rowid ASC LIMIT 1`,
  )[0];
  if (!apt) return null;
  const total =
    query<{ c: number }>(`SELECT COUNT(*) c FROM rooms WHERE apartment_id=?`, [
      apt.id,
    ])[0]?.c ?? 0;
  const occupied =
    query<{ c: number }>(
      `SELECT COUNT(*) c FROM rooms WHERE apartment_id=? AND status='occupied'`,
      [apt.id],
    )[0]?.c ?? 0;
  const available = total - occupied;
  return {
    apartment_id: apt.id,
    name: apt.name,
    address: apt.address,
    total,
    occupied,
    available,
  };
}

function ymOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function listOperatingMonths(apartmentId: string): string[] {
  ensureOperatingTables();
  let startRow = query<any>(`SELECT created_at FROM apartments WHERE id=?`, [
    apartmentId,
  ])[0];
  let start: string | null = null;
  if (startRow?.created_at) {
    start = startRow.created_at.slice(0, 7);
  } else {
    const anyRoom = query<any>(
      `SELECT created_at FROM rooms WHERE apartment_id=? ORDER BY created_at ASC LIMIT 1`,
      [apartmentId],
    )[0];
    start = anyRoom?.created_at
      ? String(anyRoom.created_at).slice(0, 7)
      : ymOf(new Date());
  }

  const arr: string[] = [];
  const s = start!;
  const [sy, sm] = s.split('-').map((x: string) => Number(x));
  const cur = new Date();
  let y = sy,
    m = sm;
  while (
    y < cur.getFullYear() ||
    (y === cur.getFullYear() && m <= cur.getMonth() + 1)
  ) {
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
  exec(`INSERT INTO operating_months (id, apartment_id, ym) VALUES (?,?,?)`, [
    id,
    apartmentId,
    ym,
  ]);

  const tpls = query<any>(
    `SELECT * FROM operating_fixed_templates WHERE apartment_id=?`,
    [apartmentId],
  );
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

export function addOperatingExpense(
  apartmentId: string,
  ym: string,
  exp: OperatingExpense,
) {
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
export function addFixedExpenseTemplate(
  apartmentId: string,
  tpl: { name: string; amount: number },
) {
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

// ===== Helpers for reports (UTC-safe) =====
function daysBetweenInclusive(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000) + 1;
}
function clampRangeOverlapDays(s1: Date, e1: Date, s2: Date, e2: Date) {
  const s = new Date(Math.max(s1.getTime(), s2.getTime()));
  const e = new Date(Math.min(e1.getTime(), e2.getTime()));
  if (e < s) return 0;
  return daysBetweenInclusive(s, e);
}
function parseItemPeriod(row: any): { ps: Date; pe: Date } {
  let ps = toDateISO(row.period_start);
  let pe = toDateISO(row.period_end);
  if (row.meta_json) {
    try {
      const m = JSON.parse(row.meta_json);
      if (m?.for_period_start && m?.for_period_end) {
        ps = toDateISO(m.for_period_start);
        pe = toDateISO(m.for_period_end);
      }
    } catch {}
  }
  return { ps, pe };
}

// ====== Reports (revenue by room, expenses) ======
export function getReportRevenueByRoom(
  apartmentId: string,
  start: string,
  end: string,
) {
  const rs = toDateISO(start);
  const re = toDateISO(end);

  const rows = query<any>(
    `
    SELECT
      r.id   AS room_id,
      r.code AS room_code,
      ii.amount, ii.meta_json, ii.description,
      i.period_start, i.period_end, i.issue_date,
      l.start_date AS lease_start,
      l.deposit_amount AS lease_deposit
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    JOIN leases   l ON l.id = i.lease_id
    JOIN rooms    r ON r.id = l.room_id
    WHERE r.apartment_id = ?
  `,
    [apartmentId],
  );

  const map: Record<string, { room_id: string; code: string; total: number }> =
    {};
  for (const r of rows) {
    if (isContractDepositItem(r)) continue;
    const { ps, pe } = parseItemPeriod(r);
    const overlap = clampRangeOverlapDays(ps, pe, rs, re);
    if (overlap <= 0) continue;

    const days = daysBetweenInclusive(ps, pe);
    const amt = Number(r.amount) || 0;
    const alloc = (amt * overlap) / days;

    if (!map[r.room_id])
      map[r.room_id] = { room_id: r.room_id, code: r.room_code, total: 0 };
    map[r.room_id].total += alloc;
  }

  const outRows = Object.values(map)
    .map(x => ({
      room_id: x.room_id,
      code: x.code,
      total: Math.round(x.total),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const total = outRows.reduce((s, x) => s + x.total, 0);

  return { rows: outRows, total };
}

export function getReportOperatingExpenses(
  apartmentId: string,
  start: string,
  end: string,
) {
  ensureOperatingTables();
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
  item: {
    name: string;
    isVariable: boolean;
    unit?: string;
    price: number;
    meterStart?: number;
  },
) {
  const ctId = addCustomChargeType(
    item.name,
    item.isVariable,
    item.unit,
    item.price,
  );

  const exist = query<{ id: string }>(
    `SELECT id FROM recurring_charges WHERE lease_id=? AND charge_type_id=? LIMIT 1`,
    [leaseId, ctId],
  )[0];

  const cfg = item.isVariable
    ? JSON.stringify({ meter_start: Number(item.meterStart || 0) })
    : null;

  if (exist) {
    exec(
      `UPDATE recurring_charges SET unit_price=?, is_variable=?, config_json=? WHERE id=?`,
      [item.price ?? 0, item.isVariable ? 1 : 0, cfg, exist.id],
    );
    return exist.id;
  }

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
  items: Array<{
    name: string;
    isVariable: boolean;
    unit?: string;
    price: number;
    meterStart?: number;
  }>,
) {
  for (const it of items) upsertRecurringChargeForLease(leaseId, it);
}
export function updateTenant(
  tenantId: string,
  fields: {
    full_name?: string;
    phone?: string;
    id_number?: string;
    note?: string;
  },
) {
  const cur = getTenant(tenantId);
  if (!cur) throw new Error('Tenant not found');

  const full_name = (fields.full_name ?? cur.full_name ?? '').trim();
  if (!full_name) throw new Error('FULL_NAME_REQUIRED');

  const phone = (fields.phone ?? cur.phone ?? null) as any;
  const id_number = (fields.id_number ?? cur.id_number ?? null) as any;
  const note = (fields.note ?? cur.note ?? null) as any;

  exec(
    `UPDATE tenants SET full_name = ?, phone = ?, id_number = ?, note = ? WHERE id = ?`,
    [full_name, phone, id_number, note, tenantId],
  );
  return getTenant(tenantId);
}
export function deleteTenant(tenantId: string) {
  const active =
    query<{ c: number }>(
      `SELECT COUNT(*) c FROM leases WHERE tenant_id = ? AND status = 'active'`,
      [tenantId],
    )[0]?.c ?? 0;
  if (active > 0) {
    throw new Error('Người thuê đang có hợp đồng hoạt động.');
  }
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

export function listApartments() {
  return query<any>(
    `SELECT id, name, address FROM apartments ORDER BY name ASC`,
  );
}

export function revenueByApartmentForMonth(
  apartmentId: string,
  year: number,
  month: number,
) {
  const { start: ms, end: me } = monthBounds(year, month);

  const rows = query<any>(
    `
    SELECT a.id AS apartment_id,
           ii.amount, ii.meta_json, ii.description,
           i.period_start, i.period_end, i.issue_date,
           l.start_date AS lease_start,
           l.deposit_amount AS lease_deposit,
           l.base_rent_collect                 -- ⬅️
    FROM invoice_items ii
    JOIN invoices  i ON i.id = ii.invoice_id
    JOIN leases    l ON l.id = i.lease_id
    JOIN rooms     r ON r.id = l.room_id
    JOIN apartments a ON a.id = r.apartment_id
    WHERE a.id = ?
  `,
    [apartmentId],
  );

  let sum = 0;
  for (const r of rows) {
    if (isContractDepositItem(r)) continue;

    const { ps, pe } = getRevenuePeriodForItem(r);
    const overlap = overlapDaysInclusive(ps, pe, ms, me);
    if (overlap <= 0) continue;

    const days = daysInclusive(ps, pe);
    sum += (Number(r.amount) || 0) * (overlap / days);
  }
  return Math.round(sum);
}
export function expenseByApartmentForMonth(
  apartmentId: string,
  year: number,
  month: number,
) {
  ensureOperatingTables();
  ensureOperatingCostTables();
  const ym = `${year}-${String(month).padStart(2, '0')}`;

  const row = query<{ sum: number }>(
    `
    SELECT SUM(expense) AS sum
    FROM (
      SELECT SUM(amount) AS expense
      FROM operating_expenses
      WHERE apartment_id = ? AND ym = ?
      UNION ALL
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

export function revenueByApartmentMonth(
  apartmentId: string,
  year: number,
  month: number,
) {
  return revenueByApartmentForMonth(apartmentId, year, month);
}

export function expensesByApartmentMonth(
  apartmentId: string,
  year: number,
  month: number,
) {
  return expenseByApartmentForMonth(apartmentId, year, month);
}

export function revenueAllApartmentsByMonth(year: number) {
  const arr: number[] = [];
  for (let m = 1; m <= 12; m++) {
    arr.push(revenueByMonth(year, m));
  }
  return arr;
}

export function revenueAndExpenseByApartmentForMonth(
  year: number,
  month: number,
) {
  ensureOperatingTables();
  ensureOperatingCostTables();

  const { start, end } = monthBounds(year, month);

  const itemRows = query<any>(`
  SELECT a.id AS apartment_id, a.name,
         ii.amount, ii.meta_json, ii.description,
         i.period_start, i.period_end, i.issue_date,
         l.start_date AS lease_start,
         l.deposit_amount AS lease_deposit,
         l.base_rent_collect
  FROM invoice_items ii
  JOIN invoices  i ON i.id = ii.invoice_id
  JOIN leases    l ON l.id = i.lease_id
  JOIN rooms     r ON r.id = l.room_id
  JOIN apartments a ON a.id = r.apartment_id
`);

  const revenueMap: Record<
    string,
    { apartment_id: string; name: string; revenue: number }
  > = {};
  for (const row of itemRows) {
    if (isContractDepositItem(row)) continue;

    const { ps, pe } = getRevenuePeriodForItem(row);
    const overlap = overlapDaysInclusive(ps, pe, start, end);
    if (overlap <= 0) continue;

    const totalDays = daysInclusive(ps, pe);
    const portion = (Number(row.amount) || 0) * (overlap / totalDays);

    (revenueMap[row.apartment_id] ||= {
      apartment_id: row.apartment_id,
      name: row.name,
      revenue: 0,
    }).revenue += portion;
  }

  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const expenses = query<any>(
    `
    SELECT apartment_id, SUM(expense) AS expense FROM (
      SELECT apartment_id, SUM(amount) AS expense
      FROM operating_expenses
      WHERE ym = ?
      GROUP BY apartment_id
      UNION ALL
      SELECT om.apartment_id AS apartment_id, SUM(oi.amount) AS expense
      FROM op_cost_items oi
      JOIN op_cost_months om ON om.id = oi.month_id
      WHERE om.ym = ?
      GROUP BY om.apartment_id
    )
    GROUP BY apartment_id
  `,
    [ym, ym],
  ).map((x: any) => ({
    apartment_id: x.apartment_id,
    expense: Number(x.expense || 0),
  }));

  const map: Record<
    string,
    {
      apartment_id: string;
      name: string;
      revenue: number;
      expense: number;
      profit: number;
    }
  > = {};
  for (const r of Object.values(revenueMap)) {
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
      const apt = query<any>(`SELECT name FROM apartments WHERE id=? LIMIT 1`, [
        e.apartment_id,
      ])[0];
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

// ===== Data fix =====
export function fixBaseRentNextPeriodMeta() {
  const rows = query<any>(`
    SELECT ii.id, ii.meta_json, i.period_end
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE ii.meta_json IS NOT NULL
  `);
  for (const r of rows) {
    try {
      const m = JSON.parse(r.meta_json);
      if (m?.base === true && m?.cycle_of === 'next') {
        const endCur = toDateISO(r.period_end);
        const nStart = addDays(endCur, 1);
        const nEnd = addDays(addMonths(nStart, 1), -1);
        m.for_period_start = toYMD(nStart);
        m.for_period_end = toYMD(nEnd);
        exec(`UPDATE invoice_items SET meta_json=? WHERE id=?`, [
          JSON.stringify(m),
          r.id,
        ]);
      }
    } catch {}
  }
}
export function ensureLeaseCyclesOpeningColumn() {
  try {
    exec(
      `ALTER TABLE lease_cycles ADD COLUMN is_opening INTEGER NOT NULL DEFAULT 0`,
    );
  } catch {}
}

export function bootstrapRentModule() {
  try {
    ensureChargeTypesTable();
  } catch {}
  try {
    ensureOperatingTables();
  } catch {}
  try {
    ensureOperatingCostTables();
  } catch {}
  try {
    fixBaseRentNextPeriodMeta();
  } catch {}
  try {
    ensureLeaseCyclesOpeningColumn();
  } catch {}
  try {
    markContractDepositItems();
  } catch {}
  try {
    fixBaseRentDuplicatesAllLeases();
  } catch {}
  try {
    ensureInvoicesExtraColumns(); // ✅ make sure qr_png_path exists
  } catch {}
}

/** ✅ Thu bổ sung vào kỳ đã có hóa đơn */
export function addSupplementChargesToCycle(
  cycleId: string,
  adjustments: Array<{ name: string; amount: number }>,
): { invoice_id: string; total: number } {
  const cycle = getCycle(cycleId);
  if (!cycle) throw new Error('Cycle not found');

  const inv = openInvoiceForCycle(cycleId);

  let addSum = 0;
  for (const adj of adjustments || []) {
    const amt = Number(adj.amount) || 0;
    if (!adj.name || amt <= 0) continue;

    addInvoiceItem(inv.id, adj.name, 1, undefined, amt, amt, undefined, {
      extra: true,
      supplemental: true,
      cycle_of: 'current',
      for_period_start: cycle.period_start,
      for_period_end: cycle.period_end,
    });
    addSum += amt;
  }

  if (addSum > 0) {
    const cur = getInvoice(inv.id);
    const newTotal = Number(cur?.total || 0) + addSum;
    exec(`UPDATE invoices SET subtotal=?, total=? WHERE id=?`, [
      newTotal,
      newTotal,
      inv.id,
    ]);
  } else {
    recalcInvoice(inv.id);
  }

  const updated = getInvoice(inv.id);
  return { invoice_id: updated.id, total: Number(updated.total || 0) };
}
/** Dò theo mô tả xem có giống “đặt cọc” không */
function looksLikeDepositDesc(descRaw: any) {
  const desc = String(descRaw || '')
    .toLowerCase()
    .trim();
  return (
    desc.includes('đặt cọc') ||
    desc.includes('dat coc') ||
    desc.includes('cọc') ||
    desc.includes('coc') ||
    desc.includes('deposit')
  );
}

/** Danh sách các dòng sẽ (hoặc đã) được tính cho tháng `year,month` kèm cờ loại bỏ vì deposit */
export function debugMonthRevenueRows(year: number, month: number) {
  const { start, end } = monthBounds(year, month);
  const rows = query<any>(
    `
    SELECT ii.id           AS item_id,
           i.id            AS invoice_id,
           ii.description,
           ii.amount,
           ii.meta_json,
           i.issue_date,
           i.period_start,
           i.period_end,
           l.start_date    AS lease_start,
           l.deposit_amount AS lease_deposit
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    JOIN leases   l ON l.id = i.lease_id
    WHERE NOT (i.period_end < ? OR i.period_start > ?)
    ORDER BY i.issue_date ASC, ii.rowid ASC
  `,
    [toYMD(start), toYMD(end)],
  );

  const out = rows.map((r: any) => {
    // báo cáo dùng khoảng kỳ (period_*), nên tính chồng lấp để biết có “rơi” vào tháng không
    const ps = toDateISO(r.period_start);
    const pe = toDateISO(r.period_end);
    const overlap = overlapDaysInclusive(ps, pe, start, end);

    // kiểm tra cọc theo đúng hàm đang dùng trong báo cáo
    const excludedBecauseDeposit = isContractDepositItem(r);

    let reason = '';
    if (excludedBecauseDeposit) {
      reason = 'deposit(contract)';
    } else if (looksLikeDepositDesc(r.description)) {
      reason = 'looks-like-deposit-but-not-marked';
    }

    return {
      item_id: r.item_id,
      invoice_id: r.invoice_id,
      description: r.description,
      amount: Number(r.amount) || 0,
      issue_date: r.issue_date,
      period_start: r.period_start,
      period_end: r.period_end,
      lease_start: r.lease_start,
      lease_deposit: Number(r.lease_deposit) || 0,
      overlapDays: overlap,
      excludedBecauseDeposit,
      reason,
    };
  });

  return out;
}

/** Quét DB và gắn cờ deposit cho những dòng chắc chắn là tiền cọc lúc ký HĐ */
export function markContractDepositItems() {
  const rows = query<any>(`
    SELECT ii.id AS item_id, ii.meta_json, ii.description, ii.amount,
           i.issue_date, i.period_start, i.period_end,
           l.start_date AS lease_start,
           l.deposit_amount AS lease_deposit
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    JOIN leases   l ON l.id = i.lease_id
  `);

  for (const r of rows) {
    // Bỏ qua nếu đã có cờ
    try {
      const m0 = r.meta_json ? JSON.parse(r.meta_json) : null;
      if (
        m0 &&
        (m0.deposit === true || m0.type === 'deposit' || m0.tag === 'deposit')
      )
        continue;
    } catch {}

    // Điều kiện: mô tả giống “đặt cọc” + số tiền ≈ deposit
    if (!looksLikeDepositDesc(r.description)) continue;
    const dep = Number(r.lease_deposit || 0);
    const amt = Number(r.amount || 0);
    if (dep <= 0 || Math.abs(amt - dep) >= 1) continue;

    // So khớp theo KHOẢNG KỲ (ưu tiên for_period_* nếu có)
    const { ps, pe } = parseItemPeriod(r);
    const leaseStart = r?.lease_start ? toDateISO(r.lease_start) : null;
    if (!leaseStart) continue;

    const withinPeriod =
      leaseStart.getTime() >= ps.getTime() &&
      leaseStart.getTime() <= pe.getTime();

    const sameMonthAsPeriodStart =
      ps.getUTCFullYear() === leaseStart.getUTCFullYear() &&
      ps.getUTCMonth() === leaseStart.getUTCMonth();

    const issue = r?.issue_date ? toDateISO(r.issue_date) : null;
    const issueSameMonth =
      !!issue &&
      issue.getUTCFullYear() === leaseStart.getUTCFullYear() &&
      issue.getUTCMonth() === leaseStart.getUTCMonth();

    if (withinPeriod || sameMonthAsPeriodStart || issueSameMonth) {
      let meta: any = {};
      try {
        meta = r.meta_json ? JSON.parse(r.meta_json) : {};
      } catch {}
      meta.deposit = true;
      meta.type = 'deposit';
      exec(`UPDATE invoice_items SET meta_json=? WHERE id=?`, [
        JSON.stringify(meta),
        r.item_id,
      ]);
    }
  }
}
function isBaseRentDesc(desc: string) {
  const d = String(desc || '');
  // Nhận diện “Tiền nhà” bằng key và bản dịch cũ
  return (
    d === 'rent.roomprice' ||
    d === t('rent.roomprice') ||
    d === (t('leaseForm.baseRent') || '')
  );
}

/** Dọn trùng các dòng TIỀN NHÀ (rent.roomprice) cho cùng một khoảng kỳ
 *  nhưng nằm ở nhiều hóa đơn khác nhau của CÙNG HỢP ĐỒNG.
 *  Giữ lại 1 dòng, xoá phần dư. Sau đó recalc lại tất cả invoice của lease.
 */
export function dedupeBaseRentAcrossLease(leaseId: string) {
  const rows = query<any>(
    `
    SELECT ii.id, ii.description, ii.meta_json, ii.invoice_id
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.lease_id = ?
  `,
    [leaseId],
  );

  const groups: Record<string, string[]> = {};
  for (const it of rows) {
    if (!isBaseRentDesc(it.description)) continue;

    let key = '';
    try {
      const m = it.meta_json ? JSON.parse(it.meta_json) : null;
      if (m?.for_period_start && m?.for_period_end) {
        key = `${m.for_period_start}__${m.for_period_end}`;
      }
    } catch {}
    if (!key) continue;

    (groups[key] ||= []).push(it.id);
  }

  // Xoá bản dư (giữ lại id đầu tiên)
  for (const ids of Object.values(groups)) {
    if (ids.length <= 1) continue;
    for (let i = 1; i < ids.length; i++) {
      exec(`DELETE FROM invoice_items WHERE id=?`, [ids[i]]);
    }
  }

  // Recalc tất cả hóa đơn của lease
  const invs = query<{ id: string }>(
    `SELECT id FROM invoices WHERE lease_id=?`,
    [leaseId],
  );
  for (const inv of invs) recalcInvoice(inv.id);
}

/** Quét & dọn trùng TIỀN NHÀ cho toàn bộ hợp đồng đang có trong DB (chạy 1 lần) */
export function fixBaseRentDuplicatesAllLeases() {
  const leases = query<{ id: string }>(`SELECT id FROM leases`, []);
  for (const l of leases) dedupeBaseRentAcrossLease(l.id);
}
function getRevenuePeriodForItem(row: any): { ps: Date; pe: Date } {
  // Lấy khoảng kỳ thực sự của dòng (ưu tiên meta.for_period_*)
  let { ps, pe } = parseItemPeriod(row);

  // Không phải "Tiền nhà" → giữ nguyên
  const desc = String(row?.description || '');
  if (!isBaseRentDesc(desc)) return { ps, pe };

  // Thu cuối kỳ → ghi nhận ngay kỳ hiện tại
  const collect = (row?.base_rent_collect || 'start') as 'start' | 'end';
  if (collect === 'end') return { ps, pe };

  // Thu đầu kỳ:
  // - Dòng đã gắn cycle_of='next' thì đã trỏ đúng sang kỳ sau → giữ nguyên
  // - Kỳ mở đầu (opening=true) thì ghi nhận cho kỳ hiện tại (tháng 10) → giữ nguyên
  try {
    const m = row?.meta_json ? JSON.parse(row.meta_json) : null;
    if (m?.cycle_of === 'next') return { ps, pe };
    if (m?.opening === true) return { ps, pe };
  } catch {}

  // Các trường hợp thu đầu kỳ còn lại → dịch sang kỳ kế tiếp
  const ns = addDays(pe, 1);
  const ne = addDays(addMonths(ns, 1), -1);
  return { ps: ns, pe: ne };
}
function ensureNextCycleAfter(leaseId: string, prevPeriodEndISO: string) {
  const lease = getLease(leaseId);
  if (!lease) return;

  const prevEnd = toDateISO(prevPeriodEndISO);
  const nextStart = addDays(prevEnd, 1);

  // Không tạo nếu hợp đồng đã có ngày kết thúc và nextStart đã vượt
  if (lease.end_date && nextStart > new Date(lease.end_date)) return;

  // Tính ngày kết thúc của kỳ kế tiếp theo kiểu chu kỳ của HĐ
  const nextEnd =
    lease.billing_cycle === 'monthly'
      ? addDays(addMonths(nextStart, 1), -1)
      : addDays(nextStart, Math.max(1, Number(lease.duration_days || 1)) - 1);

  // Tránh trùng: đã có kỳ bắt đầu đúng nextStart thì thôi
  const existed =
    query<{ c: number }>(
      `SELECT COUNT(*) c FROM lease_cycles WHERE lease_id=? AND period_start=?`,
      [leaseId, toYMD(nextStart)],
    )[0]?.c ?? 0;
  if (existed > 0) return;

  insertCycle(leaseId, nextStart, nextEnd);
}
// ==== ADD: helpers cho pro-rata & giá theo lịch ====
// TÍNH SỐ NGÀY BAO GỒM CẢ HAI ĐẦU
function daysInc(a: Date, b: Date) {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000) + 1);
}
function clamp(a: Date, b: Date, x: Date) {
  return new Date(Math.max(a.getTime(), Math.min(b.getTime(), x.getTime())));
}
function proRateAmountForRange(
  base: number,
  ps: Date,
  pe: Date,
  occS: Date,
  occE: Date,
) {
  const total = daysInc(ps, pe);
  const os = clamp(ps, pe, occS);
  const oe = clamp(ps, pe, occE);
  const over = Math.max(0, daysInc(os, oe));
  if (total <= 0 || over <= 0) return 0;
  return Math.round((base * over) / total);
}

// ==== ADD: bảng lịch tăng giá ====
export function ensureRentAdjustments() {
  exec(`CREATE TABLE IF NOT EXISTS rent_adjustments(
    id TEXT PRIMARY KEY,
    lease_id TEXT NOT NULL,
    effective_from TEXT NOT NULL,   -- YYYY-MM-DD
    base_rent REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}
export function upsertRentAdjustment(
  leaseId: string,
  effectiveFromISO: string,
  newBase: number,
) {
  ensureRentAdjustments();
  const id = uuidv4();
  exec(
    `INSERT INTO rent_adjustments (id, lease_id, effective_from, base_rent) VALUES (?,?,?,?)`,
    [id, leaseId, effectiveFromISO, Number(newBase) || 0],
  );
  return id;
}
// Lấy giá tại 1 ngày (chuẩn: dùng ngày đầu kỳ tính tiền)
export function baseRentAtDate(leaseId: string, atISO: string): number {
  ensureRentAdjustments();
  const row = query<{ base_rent: number }>(
    `SELECT base_rent FROM rent_adjustments WHERE lease_id=? AND effective_from<=? ORDER BY effective_from DESC LIMIT 1`,
    [leaseId, atISO],
  )[0];
  if (row) return Number(row.base_rent) || 0;
  const l = getLease(leaseId);
  return Number(l?.base_rent || 0);
}

// ==== ADD: phí trễ hạn ====
export function ensureLateFeeRules() {
  exec(`CREATE TABLE IF NOT EXISTS late_fee_rules(
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,               -- 'global' hoặc lease_id
    after_days INTEGER NOT NULL,       -- sau X ngày quá hạn
    fee_type TEXT NOT NULL,            -- 'flat' | 'percent'
    amount REAL NOT NULL,              -- số tiền hoặc %
    repeat_daily INTEGER NOT NULL DEFAULT 0  -- 0: một lần, 1: mỗi ngày
  )`);
}
// đặt rule toàn cục
export function setGlobalLateFeeRule(
  afterDays: number,
  type: 'flat' | 'percent',
  amount: number,
  repeatDaily = false,
) {
  ensureLateFeeRules();
  // xóa global cũ (đơn giản)
  exec(`DELETE FROM late_fee_rules WHERE scope='global'`, []);
  const id = uuidv4();
  exec(
    `INSERT INTO late_fee_rules(id,scope,after_days,fee_type,amount,repeat_daily) VALUES (?,?,?,?,?,?)`,
    [
      id,
      'global',
      Math.max(0, afterDays),
      type,
      Number(amount) || 0,
      repeatDaily ? 1 : 0,
    ],
  );
}
function getLateRuleForLease(leaseId: string) {
  ensureLateFeeRules();
  const row =
    query<any>(`SELECT * FROM late_fee_rules WHERE scope=? LIMIT 1`, [
      leaseId,
    ])[0] ||
    query<any>(
      `SELECT * FROM late_fee_rules WHERE scope='global' LIMIT 1`,
      [],
    )[0];
  return row || null;
}
/** Chạy lúc mở app/đi tới Dashboard: áp phí trễ cho hóa đơn quá hạn */
export function applyLateFeesForOverdueInvoices(todayISO?: string) {
  const today = todayISO || toYMD(new Date());
  const rows = query<any>(`
    SELECT i.id AS inv_id, i.total, i.status, c.due_date, c.period_start, c.period_end, i.lease_id
    FROM invoices i
    JOIN lease_cycles c ON c.invoice_id = i.id
    WHERE i.status != 'paid'
  `);
  for (const r of rows) {
    const rule = getLateRuleForLease(r.lease_id);
    if (!rule) continue;
    const d = new Date(today);
    const due = new Date(r.due_date);
    const lateDays = Math.floor((d.getTime() - due.getTime()) / 86400000);
    if (lateDays <= rule.after_days) continue;

    // kiểm tra đã áp hôm nay chưa (tránh trùng)
    const appliedToday =
      (query<{ c: number }>(
        `
         SELECT COUNT(*) c FROM invoice_items
         WHERE invoice_id=? AND json_extract(meta_json,'$.late_fee')=1
           AND json_extract(meta_json,'$.applied_on')=?`,
        [r.inv_id, today],
      )[0]?.c ?? 0) > 0;
    if (appliedToday) continue;
    // Nếu chỉ áp 1 lần và đã có late_fee trước đó → bỏ qua
    if (!rule.repeat_daily) {
      const existed =
        (query<{ c: number }>(
          `
           SELECT COUNT(*) c FROM invoice_items
           WHERE invoice_id=? AND json_extract(meta_json,'$.late_fee')=1`,
          [r.inv_id],
        )[0]?.c ?? 0) > 0;
      if (existed) continue;
    }

    const basis =
      rule.fee_type === 'percent'
        ? Math.round(
            ((Number(r.total) || 0) * (Number(rule.amount) || 0)) / 100,
          )
        : Math.round(Number(rule.amount) || 0);

    if (basis <= 0) continue;
    addInvoiceItem(
      r.inv_id,
      t ? t('invoice.lateFee') : 'Late fee',
      1,
      undefined,
      basis,
      basis,
      undefined,
      {
        late_fee: 1,
        applied_on: today,
        rule: {
          after_days: rule.after_days,
          type: rule.fee_type,
          amount: rule.amount,
          repeat: !!rule.repeat_daily,
        },
      },
    );
    recalcInvoice(r.inv_id);
  }
}
export function queryPaymentsOfInvoice(invoiceId: string) {
  return query<any>(`SELECT payment_date, amount, method FROM payments WHERE invoice_id=? ORDER BY payment_date ASC`, [invoiceId]);
}
// ===== Unpaid invoices / balances =====
export function listUnpaidBalances(apartmentId?: string) {
  // Trả về các kỳ đã có invoice và chưa thanh toán đủ
  const rows = query<any>(
    `
    SELECT
      c.id            AS cycle_id,
      i.id            AS invoice_id,
      i.period_start, i.period_end,
      i.total         AS total,
      COALESCE(p.paid, 0) AS paid,
      (i.total - COALESCE(p.paid, 0)) AS balance,
      r.code          AS room_code,
      l.id            AS lease_id,
      t.full_name     AS tenant_name,
      i.issue_date
    FROM invoices i
    JOIN lease_cycles c ON c.invoice_id = i.id
    JOIN leases l       ON l.id = i.lease_id
    JOIN rooms r        ON r.id = l.room_id
    LEFT JOIN tenants t ON t.id = l.tenant_id
    LEFT JOIN (
      SELECT invoice_id, SUM(amount) AS paid
      FROM payments
      GROUP BY invoice_id
    ) p ON p.invoice_id = i.id
    WHERE i.status != 'paid'
      AND (i.total - COALESCE(p.paid, 0)) > 0
      ${apartmentId ? 'AND r.apartment_id = ?' : ''}
    ORDER BY balance DESC, i.issue_date DESC
    `,
    apartmentId ? [apartmentId] : [],
  );

  return rows.map((x: any) => ({
    cycle_id: x.cycle_id,
    invoice_id: x.invoice_id,
    period_start: x.period_start,
    period_end: x.period_end,
    room_code: x.room_code,
    tenant_name: x.tenant_name || '',
    total: Number(x.total) || 0,
    paid: Number(x.paid) || 0,
    balance: Math.max(Number(x.balance) || 0, 0),
  }));
}

export function countUnpaidBalances(apartmentId?: string) {
  return listUnpaidBalances(apartmentId).length;
}
// === Late Fee & Overdue Helpers ===

type LateFeeConfig = {
  applyAfterDays: number;       // số ngày ân hạn
  type: 'flat' | 'percent';     // kiểu phạt
  amount: number;               // flat: tiền; percent: %
  repeatDaily: boolean;         // true = nhân theo số ngày quá hạn
};
export function getGlobalLateFeeConfig(): LateFeeConfig {
  const row = query<any>(`SELECT value_json FROM app_settings WHERE key='late_fee_global' LIMIT 1`)[0];
  try {
    const v = row?.value_json ? JSON.parse(row.value_json) : null;
    if (v) return v;
  } catch {}
  // mặc định: không phạt
  return { applyAfterDays: 0, type: 'flat', amount: 0, repeatDaily: false };
}

export function saveGlobalLateFeeConfig(cfg: LateFeeConfig) {
  const val = JSON.stringify(cfg || {});
  exec(`INSERT INTO app_settings (key,value_json) VALUES ('late_fee_global',?)
        ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`, [val]);
}

export function getLeaseLateFeeConfig(leaseId: string): LateFeeConfig | null {
  const row = query<any>(`SELECT late_fee_json FROM leases WHERE id=? LIMIT 1`, [leaseId])[0];
  try {
    const v = row?.late_fee_json ? JSON.parse(row.late_fee_json) : null;
    return v || null;
  } catch {}
  return null;
}

export function saveLeaseLateFeeConfig(leaseId: string, cfg: LateFeeConfig | null) {
  // null => xoá override, dùng global
  const val = cfg ? JSON.stringify(cfg) : null;
  exec(`UPDATE leases SET late_fee_json=? WHERE id=?`, [val, leaseId]);
}

export function getEffectiveLateFeeConfig(leaseId?: string | null): LateFeeConfig {
  if (leaseId) {
    const lv = getLeaseLateFeeConfig(leaseId);
    if (lv) return lv;
  }
  return getGlobalLateFeeConfig();
}

export function computeLateFeePreview(balance: number, daysLate: number, cfg: LateFeeConfig): number {
  if (balance <= 0 || daysLate <= 0 || cfg.amount <= 0) return 0;
  const multiplier = cfg.repeatDaily ? daysLate : 1;
  if (cfg.type === 'flat') return Math.max(0, Math.round(cfg.amount * multiplier));
  // percent
  return Math.max(0, Math.round(balance * (cfg.amount / 100) * multiplier));
}

// Đếm invoice quá hạn (period_end < hôm nay) còn nợ
export function countOverdueUnpaid(apartmentId?: string): number {
  const today = ymd(new Date());
  // dùng listUnpaidBalances nếu bạn đã có — ở đây gọi raw để an toàn
  const rows = query<any>(`
    SELECT i.id as invoice_id, c.id as cycle_id, c.period_end, i.total,
           (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.invoice_id=i.id) AS paid
    FROM invoices i
    JOIN lease_cycles c ON c.id = i.cycle_id
    JOIN leases l ON l.id = c.lease_id
    JOIN rooms r ON r.id = l.room_id
    ${apartmentId ? `WHERE r.apartment_id=?` : ''}
  `, apartmentId ? [apartmentId] : []);
  let count = 0;
  for (const it of rows) {
    const bal = Math.max(Number(it.total || 0) - Number(it.paid || 0), 0);
    if (bal > 0 && String(it.period_end) < today) count++;
  }
  return count;
}

// Tính số ngày trễ dựa vào config applyAfterDays
export function calcDaysLate(period_end: string, cfg: LateFeeConfig, asOf = new Date()): number {
  const due = new Date(period_end);
  due.setDate(due.getDate() + (Number(cfg.applyAfterDays) || 0));
  const diff = Math.floor((+asOf - +due) / (24 * 3600 * 1000));
  return Math.max(diff, 0);
}

function _id(prefix='id'){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

// Lấy danh sách mẫu theo apartment
export function listCatalogCharges(apartmentId: string) {
  return query<any>(
    `SELECT * FROM catalog_charges WHERE apartment_id=? ORDER BY name COLLATE NOCASE`,
    [apartmentId]
  );
}

// Tạo / cập nhật 1 mẫu
export function upsertCatalogCharge(input: {
  id?: string; apartment_id: string; charge_type_id?: string|null;
  name: string; unit?: string|null; is_variable?: number; unit_price?: number;
  config_json?: any;
}) {
  const id = input.id || _id('cc');
  const cfg = input.config_json ? JSON.stringify(input.config_json) : '{}';
  exec(
    `REPLACE INTO catalog_charges(id, apartment_id, charge_type_id, name, unit, is_variable, unit_price, config_json)
     VALUES(?,?,?,?,?,?,?,?)`,
    [
      id, input.apartment_id, input.charge_type_id || null, input.name,
      input.unit || null, Number(input.is_variable||0), Number(input.unit_price||0), cfg
    ]
  );

  // Đồng bộ xuống các recurring_charges đang link cùng source_catalog_id
  exec(
    `UPDATE recurring_charges SET
        name=?,
        unit=?,
        is_variable=?,
        unit_price=?,
        config_json=?
     WHERE source_catalog_id=?`,
    [ input.name, input.unit || null, Number(input.is_variable||0),
      Number(input.unit_price||0), cfg, id ]
  );
  return id;
}

export function deleteCatalogCharge(id: string) {
  exec(`DELETE FROM catalog_charges WHERE id=?`, [id]);
  // Không xóa recurring đang dùng, chỉ bỏ liên kết để không còn auto-sync
  exec(`UPDATE recurring_charges SET source_catalog_id=NULL WHERE source_catalog_id=?`, [id]);
}

// Áp toàn bộ catalog của apartment vào 1 lease mới
// - Không đè các khoản đã có cùng source_catalog_id
export function applyCatalogToLease(leaseId: string, apartmentId: string) {
  const cc = listCatalogCharges(apartmentId);
  const existing = query<any>(
    `SELECT source_catalog_id FROM recurring_charges WHERE lease_id=?`,
    [leaseId]
  ).map(x=>String(x.source_catalog_id||''));

  for (const c of cc) {
    if (existing.includes(String(c.id))) continue;
    exec(
      `INSERT INTO recurring_charges
        (id, lease_id, charge_type_id, name, unit, is_variable, unit_price, config_json, source_catalog_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        _id('rc'), leaseId, c.charge_type_id || null, c.name, c.unit || null,
        Number(c.is_variable||0), Number(c.unit_price||0), c.config_json || '{}', c.id
      ]
    );
  }
}

// Áp catalog cho TẤT CẢ lease active trong 1 apartment (tùy chọn)
export function applyCatalogToAllLeases(apartmentId: string) {
  const leases = query<any>(
    `SELECT l.id FROM leases l JOIN rooms r ON r.id=l.room_id
     WHERE r.apartment_id=? AND l.status='active'`, [apartmentId]
  );
  for (const L of leases) applyCatalogToLease(L.id, apartmentId);
}


