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

/** Alias giữ compatibility cho code cũ */
export const groupVN = formatNumber;
