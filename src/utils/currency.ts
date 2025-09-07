import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect, useState} from 'react';

export type Currency = 'VND' | 'USD';
const LANG_KEY = 'app.lang';
const CURR_KEY = 'app.currency';

export async function getCurrencySetting(): Promise<Currency> {
  const v = (await AsyncStorage.getItem(CURR_KEY)) as Currency | null;
  return v === 'USD' ? 'USD' : 'VND';
}

export function formatAmount(amount: number, currency: Currency, lang: 'vi'|'en' = 'vi') {
  const locale = lang === 'en' ? 'en-US' : 'vi-VN';
  const code = currency === 'USD' ? 'USD' : 'VND';
  try {
    return new Intl.NumberFormat(locale, {style:'currency', currency: code, maximumFractionDigits: currency==='USD'?2:0}).format(amount || 0);
  } catch {
    // RN Android cũ thiếu ICU -> fallback
    if (currency === 'USD') return `$${(amount||0).toFixed(2)}`;
    return `${Math.round(amount||0).toLocaleString('vi-VN')} ₫`;
  }
}

export async function formatAmountAsync(amount: number) {
  const [curr, lang] = await Promise.all([
    getCurrencySetting(),
    AsyncStorage.getItem(LANG_KEY)
  ]);
  return formatAmount(amount, curr, (lang === 'en' ? 'en' : 'vi') as 'vi'|'en');
}

// Hook tiện dùng trong component
export function useCurrency() {
  const [currency, setCurrency] = useState<Currency>('VND');
  const [lang, setLang] = useState<'vi'|'en'>('vi');
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
    format: (n: number) => formatAmount(n, currency, lang),
  };
}
