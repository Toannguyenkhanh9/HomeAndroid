// src/utils/number.ts
import i18n from '../i18n';
import * as RNLocalize from 'react-native-localize';

export const onlyDigits = (s: string): string => {
  if (!s) return '';
  // Cho phép số âm và thập phân (nếu không cần thập phân thì bỏ dấu . trong regex)
  return s.replace(/[^\d.-]/g, '');
};

const langToTag: Record<string, string> = {
  vi: 'vi-VN',
  en: 'en-US',
  ja: 'ja-JP',
  fr: 'fr-FR',
  de: 'de-DE',
  zh: 'zh-CN',
  ko: 'ko-KR',
  th: 'th-TH',
  id: 'id-ID',
};

export const getAppLocale = (): string => {
  const lang = (i18n?.language || '').trim();
  if (lang) {
    if (lang.includes('-')) return lang;           // ví dụ: en-GB
    if (langToTag[lang]) return langToTag[lang];   // ví dụ: vi -> vi-VN
  }
  const locales = RNLocalize.getLocales();
  return locales?.[0]?.languageTag || 'en-US';
};

type FormatNumberOpts = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

/**
 * Format số theo locale hiện tại của app (group theo ngôn ngữ, không có currency)
 */
export const formatNumber = (
  s: string,
  opts: FormatNumberOpts = {}
): string => {
  const n = onlyDigits(s);
  if (!n) return '';

  const value = Number(n);
  const locale = getAppLocale();

  const { minimumFractionDigits, maximumFractionDigits } = opts;

  return value.toLocaleString(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  });
};
export function formatIntTyping(s: string, locale: string = 'vi-VN') {
  const digits = (s || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString(locale);
}

// Parse số **nguyên**:  "1.200", "1,200", "1 200" -> 1200
export function parseIntSafe(s: string) {
  const digits = (s || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

// Parse số **thập phân** đa ngôn ngữ:  "0.26", "0,26", "1.234,56", "1,234.56"...
export function parseDecimalSafe(s: string) {
  if (!s) return 0;
  let x = String(s).trim().replace(/[\s\u00A0']/g, '');
  const lastComma = x.lastIndexOf(',');
  const lastDot   = x.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // Cả ',' và '.' cùng xuất hiện -> lấy ký tự cuối cùng làm dấu thập phân
    const decPos = Math.max(lastComma, lastDot);
    x = x
      .split('')
      .map((ch, i) => (ch === ',' || ch === '.') ? (i === decPos ? '.' : '') : ch)
      .join('');
  } else if (lastComma !== -1) {
    // Chỉ có ',' -> coi là dấu thập phân
    x = x.replace(',', '.');
  } else {
    // Chỉ có '.' hoặc không có gì -> coi '.' là dấu thập phân, bỏ các dấu ','
    x = x.replace(/,/g, '');
  }
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
export function formatDecimalTypingComma(input: string) {
  if (!input) return '';

  // Cho phép cả ',' hoặc '.' làm dấu thập phân, chuẩn hóa hết thành ','
  let raw = input.replace(/[^0-9.,]/g, '').replace(/\./g, ',');

  // Nếu có nhiều dấu ',' thì chỉ giữ cái đầu tiên
  const parts = raw.split(',');
  let intPart = parts[0] || '';
  let fracPart = parts[1] || '';

  // Bỏ số 0 thừa ở đầu phần nguyên (trừ khi chỉ còn "0")
  intPart = intPart.replace(/^0+(?!$)/, '');

  // Nhóm nghìn bằng dấu '.'
  if (intPart.length > 3) {
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Nếu người dùng vừa gõ ',' ở cuối thì giữ lại
  if (raw.endsWith(',')) {
    return intPart + ',';
  }

  return fracPart ? `${intPart},${fracPart}` : intPart;
}

// Parse về số khi lưu (chuyển ',' thành '.')
export function parseDecimalComma(s: string) {
  if (!s) return 0;
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : 0;
}
// ── number.ts ──────────────────────────────────────────────────────────────────
// Gõ realtime: nhóm nghìn = ".", thập phân = "," (chỉ có khi người dùng gõ)
export function formatDecimalTypingCommaSmart(input: string): string {
  if (!input) return '';

  // chỉ giữ số + 2 dấu , .
  let raw = input.replace(/[^0-9.,]/g, '');
  const firstSep = raw.search(/[.,]/);          // có gõ dấu thập phân chưa?
  const hasDecimal = firstSep !== -1;

  // chuẩn hóa: mọi '.' thành ',' để hiển thị thập phân
  raw = raw.replace(/\./g, ',');

  const [rawInt = '', rawFrac = ''] = hasDecimal ? raw.split(',', 2) : [raw, ''];

  // bỏ 0 đầu (nhưng giữ "0" nếu rỗng)
  let intDigits = rawInt.replace(/^0+(?!$)/, '');

  // nhóm nghìn bằng dấu '.'
  if (intDigits.length > 3) {
    intDigits = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // nếu người dùng vừa gõ dấu thập phân ở cuối -> giữ lại
  if (hasDecimal && /[.,]$/.test(input)) return intDigits + ',';

  return hasDecimal ? `${intDigits},${rawFrac.replace(/[^0-9]/g, '')}` : intDigits;
}

// Parse về số: bỏ dấu nghìn '.', đổi ',' -> '.'
export function parseDecimalCommaSmart(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : 0;
}



/** Alias giữ compatibility cho code cũ */
export const groupVN = formatNumber;
