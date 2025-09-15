import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNLocalize from 'react-native-localize';

type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD';
type Language = 'vi' | 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ja' | 'ko' | 'ru' | 'ar';

type SettingsState = {
  language: Language;
  dateFormat: DateFormat;
  setLanguage: (lng: Language) => void;
  setDateFormat: (fmt: DateFormat) => void;
};

const SettingsCtx = createContext<SettingsState | null>(null);

export function SettingsProvider({children}: {children: React.ReactNode}) {
  // Lấy locale hệ thống
  const locales = RNLocalize.getLocales();
  const deviceLang = locales.length > 0 ? locales[0].languageCode : 'en';

  // Nếu ko có thì fallback 'en'
  const initialLang: Language =
    (['vi','en','es','fr','de','zh','ja','ko','ru','ar'] as Language[]).includes(deviceLang as Language)
      ? (deviceLang as Language)
      : 'en';

  const [language, setLanguage] = useState<Language>(initialLang);
  const [dateFormat, setDateFormat] = useState<DateFormat>('DD/MM/YYYY');

  // load persisted
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('app_settings');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.language) setLanguage(parsed.language);
          if (parsed.dateFormat) setDateFormat(parsed.dateFormat);
        }
      } catch {}
    })();
  }, []);

  // persist
  useEffect(() => {
    AsyncStorage.setItem('app_settings', JSON.stringify({language, dateFormat}))
      .catch(() => {});
  }, [language, dateFormat]);

  const value = useMemo(
    () => ({language, dateFormat, setLanguage, setDateFormat}),
    [language, dateFormat]
  );

  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
