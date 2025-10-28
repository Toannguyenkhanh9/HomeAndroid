// src/db/migrations/ensureLateFee.ts
import { exec, query } from '../../db';

const DEFAULT_LATE_FEE = {
  enabled: false,
  afterDays: 3,
  mode: 'flat' as 'flat' | 'percent',
  flatAmount: 0,
  percent: 0,            // 0–100
  repeat: 'none' as 'none' | 'daily', // lặp mỗi ngày sau hạn
};

export function ensureLateFeeSchema() {
  try {
    // 1) app_settings
    exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY
      )
    `);

    // kiểm tra cột value_json
    const cols = query<{ name: string }>(`PRAGMA table_info('app_settings')`);
    const hasValueJson = cols.some(c => c.name === 'value_json');
    if (!hasValueJson) {
      exec(`ALTER TABLE app_settings ADD COLUMN value_json TEXT`);
    }

    // (tùy chọn) nếu đang có cột legacy 'value' thì migrate sang value_json
    const hasLegacyValue = cols.some(c => c.name === 'value');
    if (hasLegacyValue) {
      const legacy = query<{ key: string; value: string }>(
        `SELECT key, value FROM app_settings WHERE value IS NOT NULL`
      );
      for (const row of legacy) {
        // nếu value_json chưa có thì copy
        const cur = query<{ value_json: string }>(
          `SELECT value_json FROM app_settings WHERE key=? LIMIT 1`,
          [row.key]
        )[0];
        if (!cur || cur.value_json == null) {
          exec(
            `UPDATE app_settings SET value_json=? WHERE key=?`,
            [row.value, row.key]
          );
        }
      }
    }

    // 2) leases.late_fee_json
    const leaseCols = query<{ name: string }>(`PRAGMA table_info('leases')`);
    const hasLeaseLateCol = leaseCols.some(c => c.name === 'late_fee_json');
    if (!hasLeaseLateCol) {
      exec(`ALTER TABLE leases ADD COLUMN late_fee_json TEXT`);
    }

    // 3) seed giá trị mặc định cho global late_fee nếu chưa có
    const row = query<{ value_json: string }>(
      `SELECT value_json FROM app_settings WHERE key='late_fee' LIMIT 1`
    )[0];
    if (!row) {
      exec(
        `INSERT INTO app_settings (key, value_json) VALUES ('late_fee', ?)`,
        [JSON.stringify(DEFAULT_LATE_FEE)]
      );
    } else if (!row.value_json) {
      exec(
        `UPDATE app_settings SET value_json=? WHERE key='late_fee'`,
        [JSON.stringify(DEFAULT_LATE_FEE)]
      );
    }
  } catch (e) {
    // tránh crash app vì migration
    console.warn('ensureLateFeeSchema error', e);
  }
}
