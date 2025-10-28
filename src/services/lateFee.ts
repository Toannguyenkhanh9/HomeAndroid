// src/services/lateFee.ts
import { query, exec } from '../db';

export type LateFeeConfig = {
  enabled: boolean;
  afterDays: number;                 // sau X ngày mới phạt
  mode: 'flat' | 'percent';          // phạt cố định hay %
  flatAmount: number;                // số tiền cố định
  percent: number;                   // 0–100
  repeat: 'none' | 'daily';          // lặp mỗi ngày sau hạn
};

const DEFAULT_CFG: LateFeeConfig = {
  enabled: false,
  afterDays: 3,
  mode: 'flat',
  flatAmount: 0,
  percent: 0,
  repeat: 'none',
};

// ---- Helpers đọc/ghi JSON trong app_settings ----
function readSettingJSON(key: string): any | null {
  try {
    const row = query<{ value_json?: string; value?: string }>(
      `SELECT value_json, value FROM app_settings WHERE key=? LIMIT 1`,
      [key]
    )[0];
    const raw = row?.value_json ?? row?.value;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function writeSettingJSON(key: string, obj: any) {
  exec(
    `INSERT INTO app_settings (key, value_json)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`,
    [key, JSON.stringify(obj ?? null)]
  );
}

// ---- GLOBAL ----
export function getGlobalLateFeeConfig(): LateFeeConfig {
  const x = readSettingJSON('late_fee');
  return { ...DEFAULT_CFG, ...(x || {}) };
}

export function saveGlobalLateFeeConfig(cfg: LateFeeConfig) {
  writeSettingJSON('late_fee', cfg);
}

// ---- LEASE-LEVEL ----
export function getLeaseLateFeeConfig(leaseId: string): LateFeeConfig | null {
  try {
    const row = query<{ late_fee_json?: string }>(
      `SELECT late_fee_json FROM leases WHERE id=? LIMIT 1`,
      [leaseId]
    )[0];
    if (!row?.late_fee_json) return null;
    const cfg = JSON.parse(row.late_fee_json);
    return { ...DEFAULT_CFG, ...(cfg || {}) };
  } catch { return null; }
}

export function saveLeaseLateFeeConfig(leaseId: string, cfg: LateFeeConfig | null) {
  exec(
    `UPDATE leases SET late_fee_json=? WHERE id=?`,
    [cfg ? JSON.stringify(cfg) : null, leaseId]
  );
}

// ---- Preview số tiền phạt từ cấu hình ----
export function previewLateFeeAmount(
  baseAmount: number,     // tổng hóa đơn (hoặc số dư)
  cfg: LateFeeConfig,
  daysLate: number
): number {
  if (!cfg?.enabled) return 0;
  if (daysLate < (cfg.afterDays ?? 0)) return 0;

  const times = cfg.repeat === 'daily'
    ? Math.max(1, daysLate - cfg.afterDays + 1)
    : 1;

  const unit =
    cfg.mode === 'flat'
      ? (cfg.flatAmount || 0)
      : Math.round((baseAmount || 0) * (Math.max(cfg.percent || 0, 0) / 100));

  return Math.max(0, unit * times);
}
