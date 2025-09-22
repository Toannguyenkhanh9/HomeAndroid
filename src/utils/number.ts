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
type TypingOpts = { convertDot?: boolean }; // default true

export function formatDecimalTypingCommaSmart(input: string, opts: TypingOpts = {}): string {
  const convertDot = opts.convertDot ?? true;
  if (!input) return '';

  // cho phép số + 2 dấu , .
  let raw = input.replace(/[^0-9.,]/g, '');

  // nếu muốn giữ nguyên dấu '.' khi đang gõ => đừng đổi ở bước này
  // nếu vẫn muốn behavior cũ => đổi ngay
  if (convertDot) raw = raw.replace(/\./g, ',');

  // Xác định dấu thập phân đang hiển thị: ưu tiên dấu ',', nếu chưa có mà có '.' thì coi '.' là thập phân “tạm”
  const hasComma = raw.includes(',');
  const hasDot   = raw.includes('.');
  const decSep   = hasComma ? ',' : (hasDot ? '.' : null);

  const [rawIntPart, rawFracPart = ''] = decSep ? raw.split(decSep, 2) : [raw, ''];

  // nhóm nghìn cho phần nguyên (dùng '.')
  let intDigits = rawIntPart.replace(/\D/g, '').replace(/^0+(?!$)/, '');
  if (intDigits.length > 3) intDigits = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // nếu người dùng vừa gõ dấu thập phân ở cuối → giữ lại ký tự họ gõ
  if (decSep && /[.,]$/.test(input)) return intDigits + decSep;

  const fracDigits = rawFracPart.replace(/\D/g, '');
  return decSep ? `${intDigits}${decSep}${fracDigits}` : intDigits;
}

export function parseDecimalCommaSmart(s: string): number {
  if (!s) return 0;
  // bỏ dấu nghìn '.', rồi chuẩn hoá thập phân về '.'
  const normalized = s.replace(/\./g, '').replace(',', '.');
  const v = Number(normalized);
  return Number.isFinite(v) ? v : 0;
}
export function formatDecimalTypingVNStrict(input: string): string {
  if (!input) return '';
  // chỉ cho số và dấu phẩy
  let raw = input.replace(/[^0-9,]/g, '');

  // tách phần nguyên / thập phân theo DẤU PHẨY ĐẦU TIÊN
  const firstComma = raw.indexOf(',');
  const hasComma = firstComma !== -1;
  const intRaw  = hasComma ? raw.slice(0, firstComma) : raw;
  const fracRaw = hasComma ? raw.slice(firstComma + 1).replace(/,/g, '') : '';

  // nhóm nghìn cho phần nguyên bằng '.'
  let intDigits = intRaw.replace(/\D/g, '');
  // tránh rỗng -> '0' chỉ khi toàn bộ trống
  if (intDigits === '') intDigits = '0';
  const intGrouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // nếu người dùng vừa gõ dấu ',' ở cuối -> giữ lại
  if (hasComma && /,$/.test(raw)) return intGrouped + ',';

  return hasComma ? `${intGrouped},${fracRaw}` : intGrouped;
}

// Parse về number: bỏ '.' và đổi ',' thành '.'
export function parseDecimalCommaStrict(s: string): number {
  if (!s) return 0;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}



/** Alias giữ compatibility cho code cũ */
export const groupVN = formatNumber;
