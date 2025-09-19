// src/utils/currency.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type Currency = 'VND' | 'USD';
const LANG_KEY = 'app.lang';
const CURR_KEY = 'app.currency';

export async function getCurrencySetting(): Promise<Currency> {
  const v = (await AsyncStorage.getItem(CURR_KEY)) as Currency | null;
  return v === 'USD' ? 'USD' : 'VND';
}

/**
 * Hiển thị số (không có ký hiệu tiền), có phân tách hàng nghìn,
 * và giữ tối đa 2 chữ số thập phân.
 * Dùng cho mọi nơi hiển thị tiền/tổng/đơn giá để tránh bị làm tròn 0 số.
 */
export function formatAmount(
  amount: number,
  _currency: Currency,
  lang: 'vi' | 'en' = 'vi',
  opts?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
) {
  const locale = lang === 'en' ? 'en-US' : 'vi-VN';
  const maximumFractionDigits = opts?.maximumFractionDigits ?? 2;
  const minimumFractionDigits = opts?.minimumFractionDigits ?? 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'decimal',
      maximumFractionDigits,
      minimumFractionDigits,
      useGrouping: true,
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    // RN Android cũ thiếu ICU -> fallback rất đơn giản
    const n = Number.isFinite(amount) ? amount : 0;
    // giữ đến 2 số thập phân nếu có
    const fixed =
      Math.round(n * 100) === n * 100 ? n.toFixed(Math.min(2, (n.toString().split('.')[1] || '').length)) : `${n}`;
    // tách phần nguyên để chấm nhóm kiểu Việt
    const [intPart, frac = ''] = fixed.split('.');
    const grouped = Number(intPart || 0).toLocaleString('vi-VN');
    return frac ? `${grouped}.${frac}` : grouped;
  }
}

export async function formatAmountAsync(amount: number) {
  const [curr, lang] = await Promise.all([getCurrencySetting(), AsyncStorage.getItem(LANG_KEY)]);
  return formatAmount(amount, curr, (lang === 'en' ? 'en' : 'vi') as 'vi' | 'en');
}

// Hook tiện dùng trong component
export function useCurrency() {
  const [currency, setCurrency] = useState<Currency>('VND');
  const [lang, setLang] = useState<'vi' | 'en'>('vi');

  useEffect(() => {
    (async () => {
      setCurrency(await getCurrencySetting());
      const l = await AsyncStorage.getItem(LANG_KEY);
      setLang(l === 'en' ? 'en' : 'vi');
    })();
  }, []);

  return {
    currency,
    lang,
    // giữ tối đa 2 chữ số thập phân, không có ký hiệu tiền
    format: (n: number, opts?: { maximumFractionDigits?: number; minimumFractionDigits?: number }) =>
    formatAmount(n, currency, lang, opts),
    
  };
}
