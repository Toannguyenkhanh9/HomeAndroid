// src/services/invoiceHtml.ts
// Tạo HTML hóa đơn (đa ngôn ngữ + RTL) dùng trực tiếp t() từ useTranslation().
// Không phụ thuộc native PDF. Có thể share file .html hoặc .doc (Word hiểu HTML).

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

export type Branding = {
  brandName?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  note?: string;
  logoPath?: string; // file://... hoặc đường dẫn tuyệt đối
  qrPath?: string;   // file://... hoặc đường dẫn tuyệt đối
};

function escapeHtml(s: any) {
  const str = String(s ?? '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Dùng t(): thử theo thứ tự các key; nếu thiếu thì rơi về fallback */
function tt(t: TFunc, keys: string[], fallback: string) {
  for (const k of keys) {
    const v = t(k);
    if (v && v !== k) return v;
  }
  return fallback;
}

/** Ngôn ngữ → RTL + font stack phù hợp */
function getLangMeta(langRaw?: string, dirOverride?: 'ltr' | 'rtl') {
  const lang = (langRaw || 'vi').toLowerCase();
  let dir: 'ltr' | 'rtl' = lang === 'ar' ? 'rtl' : 'ltr';
  if (dirOverride) dir = dirOverride;

  const latinStack =
    `-apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Noto Sans", "Apple SD Gothic Neo", system-ui, sans-serif`;

  const stacks: Record<string, string> = {
    latin: latinStack,
    cyrillic: `"Noto Sans", "Segoe UI", Roboto, Arial, Tahoma, ${latinStack}`,
    arabic: `"Noto Sans Arabic", "Geeza Pro", "Segoe UI", ${latinStack}`,
    devanagari: `"Noto Sans Devanagari", "Kohinoor Devanagari", "Mangal", ${latinStack}`,
    thai: `"Noto Sans Thai", "Th Sarabun New", Tahoma, ${latinStack}`,
    cjk_sc: `"PingFang SC","Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei", ${latinStack}`,
    cjk_tc: `"PingFang TC","Noto Sans CJK TC","Source Han Sans TC","Microsoft JhengHei", ${latinStack}`,
    cjk_jp: `"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans CJK JP","Yu Gothic","Meiryo", ${latinStack}`,
    cjk_kr: `"Apple SD Gothic Neo","Noto Sans CJK KR","Malgun Gothic","Nanum Gothic", ${latinStack}`,
  };

  let fontFamily = stacks.latin;
  switch (lang) {
    case 'ar': fontFamily = stacks.arabic; break;
    case 'hi': fontFamily = stacks.devanagari; break;
    case 'th': fontFamily = stacks.thai; break;
    case 'ru': fontFamily = stacks.cyrillic; break;
    case 'zh': fontFamily = stacks.cjk_sc; break;
    case 'ja': fontFamily = stacks.cjk_jp; break;
    case 'ko': fontFamily = stacks.cjk_kr; break;
    default: fontFamily = stacks.latin;
  }
  return { lang, dir, fontFamily, stacks };
}

// SVG mũi tên (không phụ thuộc glyph)
const ARROW_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" style="vertical-align:-1px"><path d="M0 5h7M4 2l3 3-3 3" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** CSS nền */
function buildCss(meta: ReturnType<typeof getLangMeta>) {
  const { fontFamily, stacks } = meta;
  return `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root{ --ink:#111; --muted:#666; --border:#e5e7eb; --bg:#fff; --soft:#f6f7f8; }
  html { -webkit-print-color-adjust: exact; }
  body { margin:0; padding:24px; background:var(--bg); color:var(--ink);
         font:14px/1.45 ${fontFamily}; text-align:start; }
  .cjk-sc { font-family: ${stacks.cjk_sc}; }
  .cjk-tc { font-family: ${stacks.cjk_tc}; }
  .cjk-jp { font-family: ${stacks.cjk_jp}; }
  .cjk-kr { font-family: ${stacks.cjk_kr}; }

  .container { max-width: 820px; margin: 0 auto; }
  .header { display:flex; gap:16px; justify-content:space-between; align-items:flex-start;
            padding-bottom:12px; border-bottom:2px solid #222; margin-bottom:16px; }
  h1 { font-size:24px; margin:0 0 6px; }
  .muted { color: var(--muted); }
  .box { padding:12px; border:1px solid var(--border); border-radius:10px; }
  table { width:100%; border-collapse:collapse; margin-top:12px; }
  th, td { border-bottom:1px solid var(--border); padding:10px 8px; }
  th { background:var(--soft); text-align:left; font-weight:600; }
  .r { text-align:right; } .c { text-align:center; }
  .totals { width:60%; margin-left:auto; border:1px solid var(--border);
            border-radius:10px; overflow:hidden; }
  .totals table { margin:0; }
  .grand td { font-weight:700; border-top:2px solid #222; }
  .notes { margin-top:14px; white-space:pre-wrap; }
  .footer { color:var(--muted); font-size:12px; text-align:center; margin-top:24px; }
  [dir="rtl"] table { direction: rtl; }

  /* Payment box */
  .pay { display:flex; gap:12px; align-items:flex-start; justify-content:space-between; }
  .pay .left { flex:1; }
  .pay .kv { display:flex; gap:8px; margin:4px 0; }
  .pay .kv .label { width: 140px; color: var(--muted); }
  .pay .kv .value { flex:1; }
  .pay .brand { font-weight:700; margin-bottom:2px; }
  .pay .subtitle { color: var(--muted); font-size:12px; }
  .pay .logo { width:56px; height:56px; border-radius:8px; object-fit:cover; margin-right:10px; }
  .pay .qr { width:112px; height:112px; border-radius:8px; object-fit:cover; }
</style>`;
}

/** Đọc ảnh -> data URI (PNG/JPEG) */
async function toDataUri(path?: string) {
  if (!path) return '';
  try {
    const local = path.replace(/^file:\/\//, '');
    const b64 = await RNFS.readFile(local, 'base64');
    const ext = (local.split('.').pop() || '').toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${b64}`;
  } catch {
    return '';
  }
}

/** Resolve nhãn đơn vị từ resource có sẵn */
function resolveUnit(t: TFunc, raw?: string | null) {
  const u = (raw || '').trim();
  if (!u) return tt(t, ['cycleDetail.unitShort', 'rent.unit'], 'unit');
  if (u === 'rent.month' || u.toLowerCase() === 'tháng')
    return tt(t, ['rent.month'], 'month');
  if (u.toLowerCase() === 'unit')
    return tt(t, ['rent.unit', 'cycleDetail.unitShort'], 'unit');
  return u;
}

function buildBody(
  t: TFunc,
  format: CurrencyFormatter,
  inv: Invoice,
  items: InvoiceItem[],
  lang: string,
  assets?: { logoData?: string; qrData?: string; branding?: Branding }
) {
  // Label dùng trực tiếp t()
  const title = tt(t, ['invoice.title','cycleDetail.invoiceTotal','common.invoice'], 'Invoice');
  const codeLbl = tt(t, ['invoice.code','common.code'], 'Invoice code');
  const dateLbl = tt(t, ['invoice.date','common.date'], 'Date');
  const periodLbl = tt(t, ['cycleDetail.period'], 'Period');
  const roomLbl = tt(t, ['cycleDetail.roomInfo'], 'Room info');
  const tenantLbl = tt(t, ['cycleDetail.tenant'], 'Tenant');
  const phoneLbl = tt(t, ['tenant.phone','common.phone'], 'Phone');

  const colItem = tt(t, ['invoice.item','cycleDetail.fees'], 'Item');
  const colQty = tt(t, ['invoice.qty','cycleDetail.qtyShort'], 'Qty');
  const colUnit = tt(t, ['invoice.unit','cycleDetail.unitShort'], 'Unit');
  const colUnitPrice = tt(t, ['invoice.unitPrice','cycleDetail.unitPrice'], 'Unit price');
  const colAmount = tt(t, ['invoice.amount','cycleDetail.amount'], 'Amount');

  const subtotalLbl = tt(t, ['invoice.subtotal','common.subtotal'], 'Subtotal');
  const discountLbl = tt(t, ['invoice.discount','common.discount'], 'Discount');
  const taxLbl = tt(t, ['invoice.tax','common.tax'], 'Tax');
  const totalLbl = tt(t, ['invoice.total','cycleDetail.invoiceTotal','common.total'], 'Total');
  const notesLbl = tt(t, ['invoice.notes','common.notes'], 'Notes');
  const footerText = tt(t, ['invoice.footer'], '');

  const period =
    inv.period_start && inv.period_end
      ? `${inv.period_start} ${ARROW_SVG} ${inv.period_end}`
      : '';

  // Payment labels
  const payTitle = tt(t, ['payment.info','payment.title'], 'Payment details');
  const bankLbl = tt(t, ['payment.bankName'], 'Bank');
  const accNameLbl = tt(t, ['payment.accountName'], 'Account holder');
  const accNoLbl = tt(t, ['payment.accountNumber'], 'Account number');
  const noteLbl = tt(t, ['payment.note'], 'Note');

  // Header payment box (logo/QR + thông tin TK)
  const b = assets?.branding || {};
  const hasPay = b.bankName || b.accountName || b.accountNumber || b.note || assets?.qrData;
  const payBox = hasPay ? `
    <div class="box pay" style="margin-top:12px;">
      <div class="left">
        <div style="display:flex; align-items:center; margin-bottom:8px;">
          ${assets?.logoData ? `<img class="logo" src="${assets.logoData}" />` : ``}
          <div>
            <div class="brand">${escapeHtml(b.brandName || payTitle)}</div>
            <div class="subtitle">${escapeHtml(payTitle)}</div>
          </div>
        </div>

        <div class="kv"><div class="label">${escapeHtml(bankLbl)}</div>
          <div class="value">${escapeHtml(b.bankName || '—')}</div></div>

        <div class="kv"><div class="label">${escapeHtml(accNameLbl)}</div>
          <div class="value">${escapeHtml(b.accountName || '—')}</div></div>

        <div class="kv"><div class="label">${escapeHtml(accNoLbl)}</div>
          <div class="value">${escapeHtml(b.accountNumber || '—')}</div></div>

        ${b.note ? `<div class="kv"><div class="label">${escapeHtml(noteLbl)}</div>
          <div class="value">${escapeHtml(b.note)}</div></div>` : ``}
      </div>

      ${assets?.qrData ? `<img class="qr" src="${assets.qrData}" />` : ``}
    </div>` : ``;

  const rows = items.map((it, i) => {
    const qty = it.quantity ?? 1;
    const name = it.description === 'rent.roomprice'
      ? tt(t, ['leaseForm.baseRent'], 'Base rent')
      : it.description;
    const unit = resolveUnit(t, it.unit);
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

  const subtotal = inv.subtotal ?? items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const discount = inv.discount ?? 0;
  const tax = inv.tax ?? 0;
  const total = inv.total ?? subtotal - discount + tax;

  return `
<div class="container">
  <div class="header">
    <div>
      <h1>${escapeHtml(title)}</h1>
      <div class="muted">${escapeHtml(codeLbl)}: ${escapeHtml(inv.code || inv.id)}</div>
      ${inv.issue_date ? `<div class="muted">${escapeHtml(dateLbl)}: ${escapeHtml(inv.issue_date)}</div>` : ''}
      ${period ? `<div class="muted">${escapeHtml(periodLbl)}: ${period}</div>` : ''}
    </div>
    <div class="box">
      <div><strong>${escapeHtml(roomLbl)}</strong>: ${escapeHtml(inv.room_code || '—')}</div>
      <div><strong>${escapeHtml(tenantLbl)}</strong>: ${escapeHtml(inv.tenant_name || '—')}</div>
      ${inv.tenant_phone ? `<div><strong>${escapeHtml(phoneLbl)}</strong>: ${escapeHtml(inv.tenant_phone)}</div>` : ''}
    </div>
  </div>

  ${payBox}

  <table>
    <thead>
      <tr>
        <th class="c" style="width: 42px">#</th>
        <th>${escapeHtml(colItem)}</th>
        <th class="r" style="width: 80px">${escapeHtml(colQty)}</th>
        <th style="width: 100px">${escapeHtml(colUnit)}</th>
        <th class="r" style="width: 120px">${escapeHtml(colUnitPrice)}</th>
        <th class="r" style="width: 130px">${escapeHtml(colAmount)}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals" style="margin-top:16px;">
    <table><tbody>
      <tr><td>${escapeHtml(subtotalLbl)}</td><td class="r">${escapeHtml(format(subtotal))}</td></tr>
      ${discount ? `<tr><td>${escapeHtml(discountLbl)}</td><td class="r">- ${escapeHtml(format(discount))}</td></tr>` : ''}
      ${tax ? `<tr><td>${escapeHtml(taxLbl)}</td><td class="r">${escapeHtml(format(tax))}</td></tr>` : ''}
      <tr class="grand"><td>${escapeHtml(totalLbl)}</td><td class="r">${escapeHtml(format(total))}</td></tr>
    </tbody></table>
  </div>

  ${inv.notes ? `<div class="notes"><strong>${escapeHtml(notesLbl)}:</strong>\n${escapeHtml(inv.notes)}</div>` : ''}
  <div class="footer">${escapeHtml(footerText)}</div>
</div>`;
}

export async function createInvoiceHtmlFile(
  inv: Invoice,
  items: InvoiceItem[],
  t: TFunc,
  format: CurrencyFormatter,
  opts?: { lang?: string; dir?: 'ltr' | 'rtl'; branding?: Branding }
): Promise<string> {
  const meta = getLangMeta(opts?.lang, opts?.dir);
  const css = buildCss(meta);

  const logoData = await toDataUri(opts?.branding?.logoPath);
  const qrData = await toDataUri(opts?.branding?.qrPath);

  const body = buildBody(t, format, inv, items, meta.lang, {
    logoData, qrData, branding: opts?.branding,
  });

  const html =
    `<!doctype html><html lang="${escapeHtml(meta.lang)}" dir="${meta.dir}">` +
    `<head>${css}</head><body>${body}</body></html>`;

  const filePath = `${RNFS.CachesDirectoryPath}/invoice_${inv.code || inv.id || Date.now()}.html`;
  await RNFS.writeFile(filePath, html, 'utf8');
  return filePath;
}

/** Tạo .doc (Word hiểu HTML bọc trong .doc) */
export async function createInvoiceDocFile(
  inv: Invoice,
  items: InvoiceItem[],
  t: TFunc,
  format: CurrencyFormatter,
  opts?: { lang?: string; dir?: 'ltr' | 'rtl'; branding?: Branding }
): Promise<string> {
  const htmlPath = await createInvoiceHtmlFile(inv, items, t, format, opts);
  const docPath = htmlPath.replace(/\.html?$/i, '.doc');
  await RNFS.copyFile(htmlPath, docPath);
  return docPath;
}
