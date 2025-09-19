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


/** Alias giữ compatibility cho code cũ */
export const groupVN = formatNumber;
