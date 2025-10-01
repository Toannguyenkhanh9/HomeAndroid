// src/services/backup.ts
import { query, exec } from '../db';
import { t } from '../utils/i18nProxy';
const TABLES = [
  'apartments',
  'rooms',
  'tenants',
  'leases',
  'charge_types',
  'recurring_charges',
  'lease_cycles',
  'invoices',
  'invoice_items',
  'payments',
  'operating_expenses',
] as const;

type TableName = (typeof TABLES)[number];

function tableExists(name: string): boolean {
  try {
    const row = query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name=?`,
      [name]
    )[0];
    return (row?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
}

function getTableColumns(name: string): string[] {
  try {
    const rows = query<{ name: string }>(`PRAGMA table_info(${name})`);
    return rows.map(r => r.name);
  } catch {
    return [];
  }
}

export function exportAll() {
  const out: Record<string, any[]> = {};
  for (const t of TABLES) {
    if (!tableExists(t)) continue; // bỏ qua bảng chưa tồn tại
    try {
      out[t] = query(`SELECT * FROM ${t}`);
    } catch {
      // nếu lỗi, vẫn tiếp tục các bảng khác
      out[t] = [];
    }
  }
  return out;
}

export function exportAllAsJson(pretty = true) {
  return JSON.stringify(exportAll(), null, pretty ? 2 : 0);
}

export function importFromJson(s: string) {
  // KQ để show cho user nếu muốn
  const result: Record<string, { inserted: number; skipped: number }> = {};
  let data: Record<string, any[]>;
  if (!s || !s.trim()) {
    throw new Error(t('InputJson'));
  }

  try {
    data = JSON.parse(s);
  } catch {
    throw new Error(t('InvalidJson'));
  }

  // Transaction + tắt/bật foreign_keys để tránh thứ tự phụ thuộc
  try {
    exec('PRAGMA foreign_keys = OFF');
    exec('BEGIN TRANSACTION');

    (TABLES as readonly string[]).forEach(t => {
      const rows = Array.isArray(data[t]) ? data[t] : [];
      if (!rows.length) {
        result[t] = { inserted: 0, skipped: 0 };
        return;
      }
      if (!tableExists(t)) {
        // Bảng chưa tồn tại trong DB hiện tại → bỏ qua
        result[t] = { inserted: 0, skipped: rows.length };
        return;
      }

      const dbCols = getTableColumns(t);
      if (dbCols.length === 0) {
        result[t] = { inserted: 0, skipped: rows.length };
        return;
      }

      let ok = 0;
      let skip = 0;
      for (const r of rows) {
        if (!r || typeof r !== 'object') {
          skip++;
          continue;
        }
        // Chỉ giữ các cột có thật trong DB hiện tại
        const cols = dbCols.filter(c => Object.prototype.hasOwnProperty.call(r, c));
        if (cols.length === 0) {
          skip++;
          continue;
        }
        const placeholders = cols.map(() => '?').join(',');
        const values = cols.map(c => (r as any)[c]);
        try {
          exec(
            `INSERT OR REPLACE INTO ${t} (${cols.join(',')}) VALUES (${placeholders})`,
            values
          );
          ok++;
        } catch {
          skip++;
        }
      }
      result[t] = { inserted: ok, skipped: skip };
    });

    exec('COMMIT');
  } catch (e) {
    exec('ROLLBACK');
    throw e;
  } finally {
    exec('PRAGMA foreign_keys = ON');
  }

  return result;
}
