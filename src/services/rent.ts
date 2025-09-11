// src/services/rent.ts
import {exec, query} from '../db';
import {v4 as uuidv4} from 'uuid';

/**
 * SCHEMA CHÍNH (đảm bảo đã có trong initDb())
 * - apartments, rooms, tenants, leases
 * - charge_types: danh mục phí
 * - lease_recurring_charges: liên kết lease ↔ fees (có meter_start cho điện/nước)
 * - lease_cycles, invoices, invoice_items, payments
 *
 * CHÚ Ý:
 *  - settleCycleWithInputs() sẽ:
 *      + tự cộng TIỀN NHÀ (lease.base_rent) vào hóa đơn
 *      + cộng phí cố định hiện tại của hợp đồng
 *      + điện/nước (biến đổi): dùng quantity (tiêu thụ) = meter_end - meter_start
 *        -> lưu meta_json {meter_start, meter_end}
 *        -> cập nhật lease_recurring_charges.meter_start = meter_end cho KỲ SAU
 *      + KHÔNG tự tạo kỳ mới nếu chưa đến ngày kết thúc kỳ hiện tại
 *  - Chu kỳ đã tất toán chỉ hiển thị snapshot từ invoice_items (không hiển thị các phí vừa thêm sau này).
 */

// ========== Types ==========
type LeaseType = 'short_term' | 'long_term';
type Billing = 'daily' | 'monthly' | 'yearly';
export type FixedOrVariable = 'fixed' | 'variable';

export type LeaseConfig = {
  roomId: string;
  leaseType: LeaseType;
  billing: Billing;
  startDateISO: string;          // 'YYYY-MM-DD'
  baseRent: number;              // tiền nhà (luôn add vào invoice)
  deposit?: number;
  durationDays?: number;         // dùng cho short_term
  isAllInclusive?: boolean;      // KHÔNG dùng nữa nhưng giữ field cho tương thích
  endDateISO?: string;
  charges?: Array<{
    name: string;
    type: FixedOrVariable;       // 'fixed' = cố định, 'variable' = biến đổi
    unit?: string|null;          // 'tháng', 'kWh', 'm3', ...
    unitPrice?: number|null;     // giá/kỳ (fixed) hoặc giá/đơn vị (variable)
    meterStart?: number|null;    // chỉ số đầu cho biến đổi
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

// ========== Helpers (date) ==========
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function addYears(d: Date, n: number) { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; }
function toYMD(d: Date) { return d.toISOString().slice(0,10); }

// ========== Apartments ==========
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

// ========== Charge Types (danh mục phí) ==========
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

/**
 * Tạo hợp đồng nâng cao
 * - Luôn LƯU base_rent (tiền nhà) trong bảng leases (KHÔNG tạo charge type Tiền phòng)
 * - Nếu có charges (cố định/biến đổi), thêm vào lease_recurring_charges
 * - Sinh 1 chu kỳ đầu tiên
 */
export function startLeaseAdvanced(cfg: LeaseConfig) {
  const id = uuidv4();

  const {
    roomId, leaseType, billing, startDateISO,
    baseRent, deposit = 0, durationDays,
    endDateISO, tenant, charges
  } = cfg;

  let tenantId: string | null = null;
  if (tenant?.full_name) {
    tenantId = createTenant(tenant.full_name, tenant.phone, tenant.id_number, tenant.note);
  }

  const billing_cycle: Billing = leaseType === 'short_term' ? 'daily' : billing;

  exec(
    `INSERT INTO leases (id, room_id, lease_type, start_date, billing_cycle, base_rent, deposit_amount, duration_days, is_all_inclusive, end_date, status, tenant_id)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'active', ?)`,
    [id, roomId, leaseType, startDateISO, billing_cycle, baseRent, deposit, durationDays ?? null, 0, endDateISO ?? null, tenantId]
  );
  exec(`UPDATE rooms SET status = 'occupied' WHERE id = ?`, [roomId]);

  // charges → lease_recurring_charges
  if (Array.isArray(charges) && charges.length > 0) {
    for (const ch of charges) {
      const ctId = upsertChargeType(
        ch.name,
        ch.unit ?? null,
        ch.type === 'variable' ? 'per_unit' : 'flat',
        ch.type === 'variable' ? (ch.unitPrice ?? 0) : (ch.unitPrice ?? 0),
        ch.type === 'variable'
      );
      // biến đổi → có meter_start
      addRecurringCharge(id, ctId, ch.unitPrice ?? 0, ch.type === 'variable' ? 1 : 0, {
        meterStart: ch.type === 'variable' ? (ch.meterStart ?? 0) : undefined,
      });
    }
  }

  // tạo KỲ ĐẦU TIÊN
  createFirstCycle(id, startDateISO, billing_cycle, durationDays);

  return id;
}

// cập nhật base_rent (áp dụng kỳ sau)
export function updateLeaseBaseRent(leaseId: string, newBase: number) {
  exec(`UPDATE leases SET base_rent = ? WHERE id = ?`, [newBase, leaseId]);
}

// Thêm recurring charge cho lease
export function addRecurringCharge(
  leaseId: string,
  chargeTypeId: string,
  unit_price?: number,
  is_variable?: number,                    // 1 hoặc 0
  opts?: { meterStart?: number }
) {
  const id = uuidv4();
  const ct = getChargeType(chargeTypeId);
  const _isVar = typeof is_variable === 'number'
    ? is_variable
    : (ct?.meta_json ? (JSON.parse(ct.meta_json).is_variable ? 1 : 0) : 0);

  exec(
    `INSERT INTO lease_recurring_charges (id, lease_id, charge_type_id, unit_price, is_variable, meter_start)
     VALUES (?,?,?,?,?,?)`,
    [id, leaseId, chargeTypeId, unit_price ?? ct?.unit_price ?? 0, _isVar, _isVar ? (opts?.meterStart ?? 0) : null]
  );
  return id;
}

// thêm nhiều khoản custom
export function addCustomRecurringCharges(leaseId: string, items: AddRecurringItem[]) {
  for (const it of items) {
    const ctId = addCustomChargeType(it.name, it.isVariable, it.unit, it.price);
    addRecurringCharge(leaseId, ctId, it.price, it.isVariable ? 1 : 0, {
      meterStart: it.isVariable ? (it.meterStart ?? 0) : undefined,
    });
  }
}

// danh sách phí đang áp dụng của lease (hiện tại)
export function listChargesForLease(leaseId: string) {
  return query(`
    SELECT rc.id, rc.lease_id, rc.charge_type_id, rc.unit_price, rc.is_variable, rc.meter_start,
           ct.name, ct.unit, ct.pricing_model
    FROM lease_recurring_charges rc
    JOIN charge_types ct ON ct.id = rc.charge_type_id
    WHERE rc.lease_id = ?
    ORDER BY ct.name ASC
  `, [leaseId]);
}

// cập nhật đơn giá recurring (áp dụng kỳ sau)
export function updateRecurringChargePrice(leaseId: string, chargeTypeId: string, newPrice: number) {
  exec(
    `UPDATE lease_recurring_charges SET unit_price = ? WHERE lease_id = ? AND charge_type_id = ?`,
    [newPrice, leaseId, chargeTypeId]
  );
}

// kết thúc hợp đồng sớm (nếu không còn kỳ chưa thanh toán)
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

// ngày đến hạn sớm nhất còn mở
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
  if (billing === 'daily') e = addDays(s, Math.max(1, (durationDays ?? 1)) - 1);
  else if (billing === 'monthly') e = addMonths(s, 1);          // kỳ: [start, end]
  else e = addYears(s, 1);

  const due = e; // đến cuối kỳ là đến hạn
  const id = uuidv4();
  exec(
    `INSERT INTO lease_cycles (id, lease_id, period_start, period_end, due_date, status) VALUES (?,?,?,?,?,?)`,
    [id, leaseId, toYMD(s), toYMD(e), toYMD(due), 'open']
  );
  return id;
}
export function createNextCycle(leaseId: string, startDate: string, billing: Billing) {
  const s = new Date(startDate);
  let e: Date;
  if (billing === 'daily') e = addDays(s, 1);
  else if (billing === 'monthly') e = addMonths(s, 1);
  else e = addYears(s, 1);

  const id = uuidv4();
  exec(
    `INSERT INTO lease_cycles (id, lease_id, period_start, period_end, due_date, status)
     VALUES (?,?,?,?,?, 'open')`,
    [id, leaseId, toYMD(s), toYMD(e), toYMD(e)]
  );
  return id;
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

/**
 * settleCycleWithInputs:
 *  - CỘNG TIỀN NHÀ (lease.base_rent) → item "Tiền nhà"
 *  - CỘNG PHÍ CỐ ĐỊNH hiện tại của lease
 *  - BIẾN ĐỔI (điện/nước): quantity = (meter_end - meter_start)
 *    + Lưu meta_json {meter_start, meter_end}
 *    + Cập nhật recurring.meter_start = meter_end (để kỳ sau tính tiếp)
 *  - Cộng phụ phí phát sinh (adjustments)
 *  - KHÔNG tạo chu kỳ tiếp theo nếu hôm nay < period_end
 *    (chỉ tạo nếu hôm nay >= period_end hoặc nếu không còn future cycle)
 */
export function settleCycleWithInputs(
  cycleId: string,
  variableInputs: Array<{charge_type_id: string; quantity: number}>,
  extraCosts: Array<{name: string; amount: number}> = []
) {
  const c = getCycle(cycleId);
  if (!c) throw new Error('Cycle not found');

  const inv = openInvoiceForCycle(cycleId);
  const lease = getLease(inv.lease_id);

  // 0) TIỀN NHÀ (base_rent)
  const base = Number(lease?.base_rent || 0);
  if (base > 0) {
    addInvoiceItem(inv.id, 'Tiền nhà', 1, 'kỳ', base, base, undefined, {base_rent: true});
  }

  // CHARGES đang áp dụng (tại thời điểm settle) → KHÔNG ảnh hưởng bởi các khoản thêm sau này
  const charges = listChargesForLease(inv.lease_id) as any[];

  // 1) Cố định: tự động add theo đơn giá hiện tại
  for (const ch of charges) {
    if (Number(ch.is_variable) === 1) continue;
    const price = Number(ch.unit_price) || 0;
    if (price > 0) addInvoiceItem(inv.id, ch.name, 1, ch.unit, price, price, ch.charge_type_id);
  }

  // 2) Biến đổi: theo inputs = số tiêu thụ
  for (const inp of variableInputs) {
    const ch = charges.find((x:any)=> x.charge_type_id === inp.charge_type_id);
    if (!ch) continue;
    const qty = Math.max(0, Number(inp.quantity) || 0); // tiêu thụ
    const price = Number(ch.unit_price)||0;
    const amount = qty * price;

    // lấy meter_start hiện tại trong recurring
    const rc = query<any>(
      `SELECT meter_start FROM lease_recurring_charges WHERE lease_id = ? AND charge_type_id = ? LIMIT 1`,
      [inv.lease_id, ch.charge_type_id]
    )[0];
    const mStart = Number(rc?.meter_start || 0);
    const mEnd = mStart + qty;

    addInvoiceItem(inv.id, ch.name, qty, ch.unit, price, amount, ch.charge_type_id, {
      variable: true, meter_start: mStart, meter_end: mEnd
    });

    // cập nhật meter_start cho kỳ sau = meter_end
    exec(
      `UPDATE lease_recurring_charges SET meter_start = ? WHERE lease_id = ? AND charge_type_id = ?`,
      [mEnd, inv.lease_id, ch.charge_type_id]
    );
  }

  // 3) Phụ phí phát sinh (extra)
  for (const ex of extraCosts) {
    const amt = Number(ex.amount)||0;
    if (ex.name?.trim() && amt>0) {
      addInvoiceItem(inv.id, ex.name.trim(), 1, undefined, amt, amt, undefined, {extra: true});
    }
  }

  // 4) Tính tổng
  recalcInvoice(inv.id);

  // 5) Chốt kỳ
  exec(`UPDATE lease_cycles SET status = 'settled' WHERE id = ?`, [cycleId]);

  // 6) Tạo kỳ kế tiếp CHỈ KHI đã đến/ngay sau ngày kết thúc kỳ hiện tại
  const today = new Date();
  const periodEnd = new Date(c.period_end);
  if (today >= periodEnd) {
    // kiểm tra đã có future cycle chưa
    const hasFuture = query<{cnt:number}>(`
      SELECT COUNT(*) cnt FROM lease_cycles
      WHERE lease_id = ? AND period_start > ?
    `, [inv.lease_id, c.period_end])[0]?.cnt ?? 0;

    if (hasFuture === 0) {
      const nextStart = addDays(periodEnd, 0); // ngày sau end = cùng ngày end (tuỳ bạn muốn +1 thì đổi)
      createNextCycle(inv.lease_id, toYMD(nextStart), lease.billing_cycle);
    }
  }

  return getInvoice(inv.id);
}

// ========== Reports (ví dụ) ==========
export function revenueByMonth(year: number, month: number) {
  const ym = `${year}-${String(month).padStart(2,'0')}`;
  const rows = query<{sum:number}>(`
    SELECT SUM(total) sum FROM invoices
    WHERE strftime('%Y-%m', issue_date) = ?
  `, [ym]);
  return rows[0]?.sum ?? 0;
}
const rid = () => 'ct_' + Math.random().toString(36).slice(2) + Date.now();

/** Tạo bảng charge_types nếu chưa có */
export function ensureChargeTypesTable() {
  // name, unit, pricing_model: 'flat' (cố định) | 'per_unit' (không cố định)
  // unit_price là giá gợi ý trong catalog (không bắt buộc dùng)
  query(`
    CREATE TABLE IF NOT EXISTS charge_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT,
      pricing_model TEXT NOT NULL DEFAULT 'flat',
      unit_price REAL NOT NULL DEFAULT 0,
      meta_json TEXT
    )
  `);
}

/** Seed các loại phí mặc định – chỉ chạy 1 lần */
export function seedChargeCatalogOnce() {
  ensureChargeTypesTable();

  // Nếu đã có dữ liệu thì bỏ qua
  const existed = query<{ c: number }>(`SELECT COUNT(*) AS c FROM charge_types`);
  const count = existed?.[0]?.c ?? 0;
  if (count > 0) return;

  // Không seed "Gói bao phí", không seed "Tiền phòng"
  const defaults = [
    // Cố định (flat) – tính theo kỳ (tháng, năm...)
    { name: 'Gửi xe',      unit: 'tháng', pricing_model: 'flat' as const, unit_price: 0 },
    { name: 'Internet',    unit: 'tháng', pricing_model: 'flat' as const, unit_price: 0 },
    { name: 'Rác',         unit: 'tháng', pricing_model: 'flat' as const, unit_price: 0 },
    { name: 'Bảo trì',     unit: 'tháng', pricing_model: 'flat' as const, unit_price: 0 },
    { name: 'An Ninh',     unit: 'tháng', pricing_model: 'flat' as const, unit_price: 0 },

    // Biến đổi (per_unit) – tính theo đơn vị đo
    { name: 'Điện',        unit: 'kWh',   pricing_model: 'per_unit' as const, unit_price: 0, meta: { is_variable: true } },
    { name: 'Nước',        unit: 'm3',    pricing_model: 'per_unit' as const, unit_price: 0, meta: { is_variable: true } },
  ];

  for (const d of defaults) {
    query(
      `INSERT INTO charge_types (id, name, unit, pricing_model, unit_price, meta_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [rid(), d.name, d.unit ?? null, d.pricing_model, d.unit_price ?? 0, d.meta ? JSON.stringify(d.meta) : null],
    );
  }
}
export function closeExpiredLeases() {
  // Chuẩn ISO yyyy-mm-dd để so sánh chuỗi
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayISO = `${yyyy}-${mm}-${dd}`;

  // Tìm lease quá hạn
  const expired = query<any>(
    `SELECT l.id, l.room_id
       FROM leases l
      WHERE l.status = 'active'
        AND l.end_date IS NOT NULL
        AND l.end_date < ?`,
    [todayISO]
  );

  if (!expired.length) return;

  // Đóng lease + mở phòng
  for (const row of expired) {
    // kết thúc hợp đồng
    exec(
      `UPDATE leases
          SET status = 'ended'
        WHERE id = ?`,
      [row.id]
    );

    // giải phóng phòng (nếu còn đang occupied)
    if (row.room_id) {
      exec(
        `UPDATE rooms
            SET status = 'available'
          WHERE id = ?
            AND status != 'available'`,
        [row.room_id]
      );
    }
  }
}
