import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import * as RNLocalize from 'react-native-localize';

// ví dụ vài key cơ bản – bạn có thể mở rộng dần
const resources = {
  vi: {translation: {
    settings: 'Cài đặt',
    rooms: 'Phòng',
    tenants: 'Người thuê',
    operatingCosts: 'Chi phí hoạt động',
    report: 'Báo cáo',
    settle: 'Tất Toán',
    share: 'Chia sẻ',
  }},
  en: {translation: {
    settings: 'Settings',
    rooms: 'Rooms',
    tenants: 'Tenants',
    operatingCosts: 'Operating Costs',
    report: 'Report',
    settle: 'Settle',
    share: 'Share',
  }},
  es: {translation: {settings:'Ajustes', share:'Compartir'}},
  fr: {translation: {settings:'Paramètres', share:'Partager'}},
  de: {translation: {settings:'Einstellungen', share:'Teilen'}},
  zh: {translation: {settings:'设置', share:'分享'}},
  ja: {translation: {settings:'設定', share:'共有'}},
  ko: {translation: {settings:'설정', share:'공유'}},
  ru: {translation: {settings:'Настройки', share:'Поделиться'}},
  ar: {translation: {settings:'الإعدادات', share:'مشاركة'}},
};

const fallback = RNLocalize.getLocales()?.[0]?.languageCode || 'en';

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v3',
    resources,
    lng: fallback,
    fallbackLng: 'en',
    interpolation: {escapeValue:false},
  });

export default i18n;
