// src/services/invoiceHtml.ts
// Tạo file HTML hóa đơn với format đẹp & hỗ trợ đa ngôn ngữ (RTL/CJK/Devanagari/Thai...)
// Không phụ thuộc native; chỉ dùng RNFS để ghi file .html/.doc

import RNFS from 'react-native-fs';

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
  total?: number;
  notes?: string;
};

function escapeHtml(s: any) {
  const str = String(s ?? '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Ngôn ngữ → hướng viết + class + font stack */
function getLangMeta(langRaw?: string) {
  const lang = (langRaw || 'vi').toLowerCase();

  // mặc định LTR
  let dir: 'ltr' | 'rtl' = 'ltr';
  // class lang-* để áp style riêng
  let bodyClass = `lang-${lang}`;

  // Font stack “base” cho Latin/VN
  const latinStack =
    `-apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Noto Sans", ` +
    `"Apple SD Gothic Neo", system-ui, sans-serif`;

  // Map theo nhóm script
  const stacks: Record<string, string> = {
    // Latin & Vietnamese & Tây Âu (vi/en/es/fr/de/pt/id/ms/fil)
    latin: latinStack,
    // Cyrillic (ru)
    cyrillic: `"Noto Sans", "Segoe UI", Roboto, Arial, Tahoma, ${latinStack}`,
    // Arabic (ar) → RTL
    arabic: `"Noto Sans Arabic", "Geeza Pro", "Segoe UI", ${latinStack}`,
    // Devanagari (hi)
    devanagari: `"Noto Sans Devanagari", "Kohinoor Devanagari", "Mangal", ${latinStack}`,
    // Thai (th)
    thai: `"Noto Sans Thai", "Th Sarabun New", Tahoma, ${latinStack}`,
    // CJK chung: ưu tiên iOS trước, rồi Android/Win
    cjk_sc: `"PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", ${latinStack}`,
    cjk_tc: `"PingFang TC", "Noto Sans CJK TC", "Source Han Sans TC", "Microsoft JhengHei", ${latinStack}`,
    cjk_jp: `"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans CJK JP", "Yu Gothic", "Meiryo", ${latinStack}`,
    cjk_kr: `"Apple SD Gothic Neo", "Noto Sans CJK KR", "Malgun Gothic", "Nanum Gothic", ${latinStack}`,
  };

  // chọn theo code
  let fontFamily = stacks.latin;
  switch (lang) {
    case 'ar':
      dir = 'rtl';
      fontFamily = stacks.arabic;
      break;
    case 'hi':
      fontFamily = stacks.devanagari;
      break;
    case 'th':
      fontFamily = stacks.thai;
      break;
    case 'ru':
      fontFamily = stacks.cyrillic;
      break;
    case 'zh': // không phân biệt SC/TC => dùng SC + TC trong CSS phụ
      fontFamily = stacks.cjk_sc;
      break;
    case 'ja':
      fontFamily = stacks.cjk_jp;
      break;
    case 'ko':
      fontFamily = stacks.cjk_kr;
      break;
    default:
      // vi,en,es,fr,de,pt,id,ms,fil → latin
      fontFamily = stacks.latin;
  }

  return { lang, dir, bodyClass, fontFamily, stacks };
}

// SVG mũi tên để không phụ thuộc font symbols
const ARROW_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" style="vertical-align:-1px"><path d="M0 5h7M4 2l3 3-3 3" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** CSS “core” + CSS phụ theo ngôn ngữ */
function buildCss(langMeta: ReturnType<typeof getLangMeta>) {
  const { fontFamily, stacks } = langMeta;

  return `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root{
    --ink:#111; --muted:#666; --border:#e5e7eb; --bg:#fff; --soft:#f6f7f8;
  }
  html { -webkit-print-color-adjust: exact; }
  body {
    margin: 0; padding: 24px;
    background: var(--bg); color: var(--ink);
    font: 14px/1.45 ${fontFamily};
    text-align: start;
  }

  /* Fallback rõ ràng cho CJK nếu text trộn: class phụ để bọc đoạn cụ thể */
  .cjk-sc { font-family: ${stacks.cjk_sc}; }
  .cjk-tc { font-family: ${stacks.cjk_tc}; }
  .cjk-jp { font-family: ${stacks.cjk_jp}; }
  .cjk-kr { font-family: ${stacks.cjk_kr}; }

  .container { max-width: 820px; margin: 0 auto; }
  .header {
    display: flex; gap: 16px; justify-content: space-between; align-items: flex-start;
    padding-bottom: 12px; border-bottom: 2px solid #222; margin-bottom: 16px;
  }
  h1 { font-size: 24px; margin: 0 0 6px; }
  .muted { color: var(--muted); }
  .box { padding: 12px; border: 1px solid var(--border); border-radius: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border-bottom: 1px solid var(--border); padding: 10px 8px; }
  th { background: var(--soft); text-align: left; font-weight: 600; }
  .r { text-align: right; } .c { text-align: center; }
  .totals { width: 60%; margin-left: auto; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .totals table { margin: 0; }
  .grand td { font-weight: 700; border-top: 2px solid #222; }
  .notes { margin-top: 14px; white-space: pre-wrap; }
  .footer { color: var(--muted); font-size: 12px; text-align: center; margin-top: 24px; }

  /* RTL: chỉ đổi hướng bảng khi body là rtl */
  [dir="rtl"] table { direction: rtl; }
</style>`;
}

function buildBody(t: TFunc, format: CurrencyFormatter, inv: Invoice, items: InvoiceItem[]) {
  const period =
    inv.period_start && inv.period_end
      ? `${inv.period_start} ${ARROW_SVG} ${inv.period_end}`
      : '';

  const rows = items.map((it, i) => {
    const qty = it.quantity ?? 1;
    const unit = it.unit || t('rent.unit');
    const name =
      it.description === 'rent.roomprice' ? (t('leaseForm.baseRent') || 'Base rent') : it.description;
    return `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${escapeHtml(name)}</td>
        <td class="r">${escapeHtml(qty)}</td>
        <td>${escapeHtml(unit)}</td>
        <td class="r">${escapeHtml(format(it.unit_price || 0))}</td>
        <td class="r">${escapeHtml(format(it.amount || 0))}</td>
      </tr>`;
  }).join('');

  const subtotal =
    inv.subtotal ?? items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const discount = inv.discount ?? 0;
  const tax = inv.tax ?? 0;
  const total = inv.total ?? subtotal - discount + tax;

  return `
<div class="container">
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
        <th class="c" style="width: 42px">#</th>
        <th>${escapeHtml(t('invoice.item') || 'Item')}</th>
        <th class="r" style="width: 80px">${escapeHtml(t('invoice.qty') || 'Qty')}</th>
        <th style="width: 100px">${escapeHtml(t('invoice.unit') || 'Unit')}</th>
        <th class="r" style="width: 120px">${escapeHtml(t('invoice.unitPrice') || 'Unit Price')}</th>
        <th class="r" style="width: 130px">${escapeHtml(t('invoice.amount') || 'Amount')}</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="totals" style="margin-top:16px;">
    <table>
      <tbody>
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
      </tbody>
    </table>
  </div>

  ${inv.notes ? `<div class="notes"><strong>${escapeHtml(t('invoice.notes') || 'Notes')}:</strong>\n${escapeHtml(inv.notes)}</div>` : ''}

  <div class="footer">${escapeHtml(t('invoice.footer') || '')}</div>
</div>`;
}

export async function createInvoiceHtmlFile(
  inv: Invoice,
  items: InvoiceItem[],
  t: TFunc,
  format: CurrencyFormatter,
  opts?: { lang?: string } // dir sẽ tự quyết định theo lang
): Promise<string> {
  const meta = getLangMeta(opts?.lang);
  const css = buildCss(meta);
  const body = buildBody(t, format, inv, items);

  const html =
    `<!doctype html>` +
    `<html lang="${escapeHtml(meta.lang)}" dir="${meta.dir}">` +
    `<head>${css}</head><body class="${escapeHtml(meta.bodyClass)}">` +
    `${body}</body></html>`;

  const filePath = `${RNFS.CachesDirectoryPath}/invoice_${inv.code || inv.id || Date.now()}.html`;
  await RNFS.writeFile(filePath, html, 'utf8');
  return filePath;
}

/** Tạo file .doc (Word hiểu HTML bọc trong .doc) */
export async function createInvoiceDocFile(
  inv: Invoice,
  items: InvoiceItem[],
  t: TFunc,
  format: CurrencyFormatter,
  opts?: { lang?: string }
): Promise<string> {
  const path = await createInvoiceHtmlFile(inv, items, t, format, opts);
  const docPath = path.replace(/\.html?$/i, '.doc');
  await RNFS.copyFile(path, docPath);
  return docPath;
}
