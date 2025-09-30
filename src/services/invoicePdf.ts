// src/services/invoicePdf.ts
// Tạo PDF hóa đơn đa ngôn ngữ với font nhúng (base64).
// Phương án nhẹ: embed Latin/VN (+ Arabic/Devanagari/Thai khi cần), CJK dùng system fonts.
// Phụ thuộc: react-native-fs, react-native-html-to-pdf

import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

// ---- Robust import cho RNHTMLtoPDF (tránh undefined/convert of undefined)
let RNHTMLtoPDF: any;
try {
  // một số bundlers expose default, một số không
  const mod = require('react-native-html-to-pdf');
  RNHTMLtoPDF = mod?.default ?? mod;
} catch {
  RNHTMLtoPDF = undefined;
}

// ====== Kiểu dữ liệu ======
export type TFunc = (key: string, opts?: any) => string;
export type CurrencyFormatter = (n: number) => string;

export type InvoiceItem = {
  id?: string;
  description: string;
  quantity?: number;
  unit?: string | null;
  unit_price: number;
  amount: number;
  meta_json?: string | null;
};

export type Invoice = {
  id: string;
  code?: string;
  tenant_name?: string;
  tenant_phone?: string;
  room_code?: string;
  issue_date?: string;    // YYYY-MM-DD
  period_start?: string;  // YYYY-MM-DD
  period_end?: string;    // YYYY-MM-DD
  subtotal?: number;
  discount?: number;
  tax?: number;
  total: number;
  notes?: string;
};

// ====== Cấu hình tên file font trong bundle (thay bằng bản subset nếu có) ======
const FONT_FILES = {
  latinVN: [
    // Ưu tiên subset nếu bạn đã tạo:
    'fonts/NotoSans-Regular-LatinVN-Cyr.ttf',
    'fonts/NotoSans-Regular-LatinVN.ttf',
    // Fallback bản full:
    'fonts/NotoSans-Regular.ttf',
  ],
  arabic: [
    'fonts/NotoSansArabic-Regular-AR.ttf',
    'fonts/NotoSansArabic-Regular.ttf',
  ],
  devanagari: [
    'fonts/NotoSansDevanagari-Regular-HI.ttf',
    'fonts/NotoSansDevanagari-Regular.ttf',
  ],
  thai: [
    'fonts/NotoSansThai-Regular-TH.ttf',
    'fonts/NotoSansThai-Regular.ttf',
  ],
} as const;

// Mapping ngôn ngữ → cần embed font nào (CJK dùng system)
const EMBED_BY_LANG: Record<
  string,
  Array<keyof typeof FONT_FILES>
> = {
  vi: ['latinVN'],
  en: ['latinVN'],
  es: ['latinVN'],
  fr: ['latinVN'],
  de: ['latinVN'],
  pt: ['latinVN'],
  id: ['latinVN'],
  ms: ['latinVN'],
  fil: ['latinVN'],
  ru: ['latinVN'], // đảm bảo NotoSans của bạn có cả Cyrillic (khuyên dùng subset LatinVN+Cyr)
  ar: ['latinVN', 'arabic'],
  hi: ['latinVN', 'devanagari'],
  th: ['latinVN', 'thai'],
  zh: ['latinVN'],
  ja: ['latinVN'],
  ko: ['latinVN'],
};

// ====== Helpers ======
function escapeHtml(s: any) {
  const str = String(s ?? '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Thử đọc 1 danh sách đường dẫn font, trả về base64 của mục đọc được đầu tiên. */
async function fontToBase64Candidates(candidates: string[]): Promise<string> {
  for (const file of candidates) {
    try {
      if (Platform.OS === 'ios') {
        // iOS: đọc từ MainBundlePath
        const p1 = `${RNFS.MainBundlePath}/${file}`;
        if (await RNFS.exists(p1)) return RNFS.readFile(p1, 'base64');
        // fallback nếu bạn kéo font vào root bundle (không có "fonts/")
        const nameOnly = file.split('/').pop()!;
        const p2 = `${RNFS.MainBundlePath}/${nameOnly}`;
        if (await RNFS.exists(p2)) return RNFS.readFile(p2, 'base64');
      } else {
        // Android: đọc từ assets/
        return await RNFS.readFileAssets(file, 'base64');
      }
    } catch {
      // thử mục tiếp theo
    }
  }
  // Không tìm thấy → trả chuỗi rỗng để bỏ qua embed font đó
  return '';
}

/** Tạo CSS @font-face theo các base64 có được + fallback CJK hệ thống */
function buildCss(params: {
  latinVN?: string;
  arabic?: string;
  devanagari?: string;
  thai?: string;
}) {
  const { latinVN, arabic, devanagari, thai } = params;

  return `
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 18mm 14mm 20mm; }

  ${latinVN ? `
  @font-face {
    font-family: 'LatinVN';
    src: url(data:font/ttf;base64,${latinVN}) format('truetype');
    font-weight: 400; font-style: normal;
  }` : ''}

  ${arabic ? `
  @font-face {
    font-family: 'Arabic';
    src: url(data:font/ttf;base64,${arabic}) format('truetype');
    font-weight: 400; font-style: normal;
  }` : ''}

  ${devanagari ? `
  @font-face {
    font-family: 'Deva';
    src: url(data:font/ttf;base64,${devanagari}) format('truetype');
    font-weight: 400; font-style: normal;
  }` : ''}

  ${thai ? `
  @font-face {
    font-family: 'Thai';
    src: url(data:font/ttf;base64,${thai}) format('truetype');
    font-weight: 400; font-style: normal;
  }` : ''}

  /* CJK fallback dùng system fonts để không tăng size app */
  .cjk-sc { font-family: 'PingFang SC','Noto Sans CJK SC','Source Han Sans SC','Microsoft YaHei',sans-serif; }
  .cjk-tc { font-family: 'PingFang TC','Noto Sans CJK TC','Source Han Sans TC','Microsoft JhengHei',sans-serif; }
  .cjk-jp { font-family: 'Hiragino Kaku Gothic ProN','Hiragino Sans','Noto Sans CJK JP','Meiryo','Yu Gothic',sans-serif; }
  .cjk-kr { font-family: 'Apple SD Gothic Neo','Noto Sans CJK KR','Malgun Gothic','Nanum Gothic',sans-serif; }

  html { -webkit-print-color-adjust: exact; }
  body {
    font-family:
      ${latinVN ? `'LatinVN',` : ''}
      ${devanagari ? `'Deva',` : ''}
      ${thai ? `'Thai',` : ''}
      ${arabic ? `'Arabic',` : ''}
      'PingFang SC','PingFang TC','Hiragino Kaku Gothic ProN','Apple SD Gothic Neo',
      -apple-system,'Segoe UI',system-ui,sans-serif;
    font-size: 12px; color: #111;
  }

  h1 { font-size: 20px; margin: 0 0 6px; }
  .muted { color: #666; }
  .header {
    display: flex; justify-content: space-between; align-items: flex-start;
    margin-bottom: 16px;
    border-bottom: 2px solid #222; padding-bottom: 8px;
  }
  .box { padding: 10px; border: 1px solid #ddd; border-radius: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border-bottom: 1px solid #eee; padding: 8px; }
  th { background: #f6f7f8; text-align: left; }
  .r { text-align: right; }
  .c { text-align: center; }
  .totals { width: 50%; margin-left: auto; }
  .totals td { padding: 6px 8px; }
  .grand { font-weight: 700; border-top: 2px solid #222; }
  .notes { margin-top: 12px; white-space: pre-wrap; }
  [dir="rtl"] table { direction: rtl; }
</style>`;
}

/** SVG mũi tên thay cho ký tự → để khỏi phụ thuộc font symbols */
const ARROW_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" style="vertical-align:-1px"><path d="M0 5h7M4 2l3 3-3 3" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Sinh phần HTML body của PDF */
function buildBodyHtml(args: {
  t: TFunc;
  format: CurrencyFormatter;
  inv: Invoice;
  items: InvoiceItem[];
}) {
  const { t, format, inv, items } = args;

  const period =
    inv.period_start && inv.period_end
      ? `${inv.period_start} ${ARROW_SVG} ${inv.period_end}`
      : '';

  const rowsHtml = items
    .map((it, idx) => {
      const qty = it.quantity ?? 1;
      const unit = it.unit || t('rent.unit');
      return `
        <tr>
          <td class="c">${idx + 1}</td>
          <td>${escapeHtml(
            it.description === 'rent.roomprice'
              ? t('leaseForm.baseRent')
              : it.description,
          )}</td>
          <td class="r">${escapeHtml(qty)}</td>
          <td>${escapeHtml(unit)}</td>
          <td class="r">${escapeHtml(format(it.unit_price || 0))}</td>
          <td class="r">${escapeHtml(format(it.amount || 0))}</td>
        </tr>`;
    })
    .join('');

  const subtotal =
    inv.subtotal ?? items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const discount = inv.discount ?? 0;
  const tax = inv.tax ?? 0;
  const total = inv.total ?? subtotal - discount + tax;

  return `
<div class="header">
  <div>
    <h1>${escapeHtml(t('invoice.title') || 'Invoice')}</h1>
    <div class="muted">${escapeHtml(t('invoice.code') || 'Code')}: ${escapeHtml(inv.code || inv.id)}</div>
    ${inv.issue_date ? `<div class="muted">${escapeHtml(t('invoice.date') || 'Date')}: ${escapeHtml(inv.issue_date)}</div>` : ''}
    ${period ? `<div class="muted">${escapeHtml(t('cycleDetail.period') || 'Period')}: ${period}</div>` : ''}
  </div>
  <div class="box">
    <div><strong>${escapeHtml(t('cycleDetail.roomInfo') || 'Room')}</strong>: ${escapeHtml(inv.room_code || '—')}</div>
    <div><strong>${escapeHtml(t('cycleDetail.tenant') || 'Tenant')}</strong>: ${escapeHtml(inv.tenant_name || '—')}</div>
    ${inv.tenant_phone ? `<div><strong>${escapeHtml(t('tenant.phone') || 'Phone')}</strong>: ${escapeHtml(inv.tenant_phone)}</div>` : ''}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th class="c" style="width: 36px;">#</th>
      <th>${escapeHtml(t('invoice.item') || 'Item')}</th>
      <th class="r" style="width: 70px;">${escapeHtml(t('invoice.qty') || 'Qty')}</th>
      <th style="width: 90px;">${escapeHtml(t('invoice.unit') || 'Unit')}</th>
      <th class="r" style="width: 120px;">${escapeHtml(t('invoice.unitPrice') || 'Unit Price')}</th>
      <th class="r" style="width: 130px;">${escapeHtml(t('invoice.amount') || 'Amount')}</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>

<table class="totals">
  <tr>
    <td>${escapeHtml(t('invoice.subtotal') || 'Subtotal')}</td>
    <td class="r">${escapeHtml(format(subtotal))}</td>
  </tr>
  ${discount ? `<tr><td>${escapeHtml(t('invoice.discount') || 'Discount')}</td><td class="r">- ${escapeHtml(format(discount))}</td></tr>` : ''}
  ${tax ? `<tr><td>${escapeHtml(t('invoice.tax') || 'Tax')}</td><td class="r">${escapeHtml(format(tax))}</td></tr>` : ''}
  <tr class="grand">
    <td>${escapeHtml(t('invoice.total') || 'Total')}</td>
    <td class="r">${escapeHtml(format(total))}</td>
  </tr>
</table>

${inv.notes ? `<div class="notes"><strong>${escapeHtml(t('invoice.notes') || 'Notes')}:</strong><br/>${escapeHtml(inv.notes)}</div>` : ''}
`;
}

// ====== API chính ======
export async function createInvoicePdfFile(
  inv: Invoice,
  items: InvoiceItem[],
  t: TFunc,
  format: CurrencyFormatter,
  opts?: { lang?: string; dir?: 'ltr' | 'rtl' }
): Promise<string> {
  // 1) Quyết định font cần embed theo ngôn ngữ
  const lang = (opts?.lang || 'vi').toLowerCase();
  const fontsNeeded = EMBED_BY_LANG[lang] ?? ['latinVN'];

  // 2) Đọc base64 các font cần thiết (nếu thiếu file sẽ bỏ qua)
  const needLatin = fontsNeeded.includes('latinVN');
  const needArabic = fontsNeeded.includes('arabic');
  const needDeva = fontsNeeded.includes('devanagari');
  const needThai = fontsNeeded.includes('thai');

  const [latinVN, arabic, devanagari, thai] = await Promise.all([
    needLatin ? fontToBase64Candidates(FONT_FILES.latinVN) : Promise.resolve(''),
    needArabic ? fontToBase64Candidates(FONT_FILES.arabic) : Promise.resolve(''),
    needDeva ? fontToBase64Candidates(FONT_FILES.devanagari) : Promise.resolve(''),
    needThai ? fontToBase64Candidates(FONT_FILES.thai) : Promise.resolve(''),
  ]);

  // 3) Lắp CSS + HTML
  const css = buildCss({ latinVN, arabic, devanagari, thai });
  const body = buildBodyHtml({ t, format, inv, items });
  const dirAttr = opts?.dir || (lang === 'ar' ? 'rtl' : 'ltr');
  const html = `<!doctype html><html><head>${css}</head><body dir="${dirAttr}" lang="${escapeHtml(lang)}">${body}</body></html>`;

  // 4) Kiểm tra native module đã link chưa
  if (!RNHTMLtoPDF?.convert) {
    throw new Error(
      "react-native-html-to-pdf chưa được link. Vui lòng:\n" +
      "1) yarn add react-native-html-to-pdf react-native-fs react-native-share\n" +
      "2) iOS: cd ios && pod install\n" +
      "3) Gỡ app cũ và build lại (không chỉ reload). Nếu bật New Architecture, hãy tắt (newArchEnabled=false)."
    );
  }

  // 5) Convert và trả file path
  const result = await RNHTMLtoPDF.convert({
    html,
    fileName: `invoice_${inv.code || inv.id}`,
    base64: false,
  });

  if (!result?.filePath) throw new Error('Failed to create PDF');
  return result.filePath;
}
