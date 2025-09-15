import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import 'dayjs/locale/es';
import 'dayjs/locale/fr';
import 'dayjs/locale/de';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/ru';
import 'dayjs/locale/ar';

export function formatDateISO(iso: string, fmt: string, locale: string) {
  dayjs.locale(mapLocale(locale));
  return dayjs(iso).format(fmt);
}

function mapLocale(lng: string) {
  if (lng === 'zh') return 'zh-cn';
  return lng; // vi, en, es, fr, de, ja, ko, ru, ar
}
