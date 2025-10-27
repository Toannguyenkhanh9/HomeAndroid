// src/services/leasePdf.ts
import { Platform } from 'react-native';

type LeasePdfInput = {
  lease: any;
  tenant: any;
  room: any;
  charges: any[];
  signatures?: { tenant?: string; landlord?: string }; // base64 | data-uri | file://
  branding?: any;
  lang?: string;
  t?: (k: string, opt?: any) => string;
};

function safeHtmlToPdf() {
  try { const m = require('react-native-html-to-pdf'); return m?.default ?? m; } catch {}
  return undefined;
}
function safeRNPrint() {
  try { const m = require('react-native-print'); return (m?.default ?? m) as { print: (o:any)=>Promise<void> }; } catch {}
  return undefined;
}

function esc(s?: string) {
  return (s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ✅ Chuẩn hoá nguồn ảnh chữ ký: nhận data-uri | base64 thô | file://
async function imgSrc(input?: string): Promise<string> {
  if (!input) return '';
  let v = String(input).trim();
  if (!v) return '';

  // Đã là data-uri hợp lệ
  if (/^data:image\//i.test(v)) return v;

  // Một số lib trả về "base64,...." hoặc "data:image/...;base64,...."
  v = v.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').replace(/^base64,?/i, '');

  // File URI -> đọc ra base64
  if (/^file:\/\//i.test(input)) {
    try {
      const RNFS = require('react-native-fs');
      const p = input.replace(/^file:\/\//, '');
      const b64 = await RNFS.readFile(p, 'base64');
      return `data:image/png;base64,${b64}`;
    } catch { return ''; }
  }

  // Coi như base64 thô
  return `data:image/png;base64,${v}`;
}

export async function createLeasePdfFile(input: LeasePdfInput): Promise<string|''> {
  const { lease, tenant, room, charges = [], signatures, branding, t = (k)=>k } = input;

  // ⬇️ xử lý chữ ký an toàn
  const sigTenant = await imgSrc(signatures?.tenant);
  const sigLandlord = await imgSrc(signatures?.landlord);

  const rows = charges.map((c:any) => {
    const unit = Number(c.is_variable) === 1 ? (c.unit || 'unit') : (t('units.month') || 'month');
    return `<tr>
      <td>${esc(c.name)}</td>
      <td>${Number(c.is_variable) === 1 ? esc(t('leaseDetail.variable')) : esc(t('leaseDetail.fixed'))}</td>
      <td style="text-align:right">${(Number(c.unit_price)||0).toLocaleString('vi-VN')}</td>
      <td>${esc(unit)}</td>
    </tr>`;
  }).join('');

  const b = branding || {};
  const brandInfo = [
    b.brandName ? `<div>${esc(b.brandName)}</div>` : '',
    b.bankName ? `<div>${esc(t('payment.bankName')||'Ngân hàng')}: ${esc(b.bankName)}</div>` : '',
    b.accountName ? `<div>${esc(t('payment.accountName')||'Tên TK')}: ${esc(b.accountName)}</div>` : '',
    b.accountNumber ? `<div>${esc(t('payment.accountNumber')||'Số TK')}: ${esc(b.accountNumber)}</div>` : '',
    b.note ? `<div>${esc(t('payment.note')||'Nội dung CK')}: ${esc(b.note)}</div>` : '',
  ].filter(Boolean).join('');

  const html = `
  <html><head><meta charset="utf-8"/>
  <style>
    body{font-family:-apple-system,Roboto,Arial,sans-serif;font-size:12px;color:#111}
    h1{font-size:18px;margin:0 0 8px} h2{font-size:14px;margin:12px 0 6px}
    table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:6px}
    th{background:#f5f5f5;text-align:left}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .box{border:1px solid #eee;padding:8px;border-radius:6px}
    .muted{color:#555}.sig{height:80px;object-fit:contain}
  </style></head>
  <body>
    <h1>${t('leasePdf.title') || 'HỢP ĐỒNG THUÊ'}</h1>

    <div class="grid">
      <div class="box">
        <h2>${t('leaseDetail.tenant') || 'Người thuê'}</h2>
        <div>${t('leaseDetail.name') || 'Tên'}: ${esc(tenant?.full_name || '—')}</div>
        <div>${t('leaseDetail.idNumber') || 'CCCD/CMND'}: ${esc(tenant?.id_number || '—')}</div>
        <div>${t('leaseDetail.phone') || 'Điện thoại'}: ${esc(tenant?.phone || '—')}</div>
      </div>
      <div class="box">
        <h2>${t('common.room') || 'Phòng'}</h2>
        <div>${t('common.room') || 'Phòng'}: ${esc(room?.code || '—')}</div>
        <div>${t('leaseDetail.start') || 'Bắt đầu'}: ${esc(lease?.start_date || '')}</div>
        <div>${t('leaseDetail.end') || 'Kết thúc'}: ${esc(lease?.end_date || '—')}</div>
        <div>${t('leaseDetail.baseRent') || 'Giá thuê'}: ${(Number(lease?.base_rent)||0).toLocaleString('vi-VN')}</div>
        <div>${t('leaseDetail.deposit') || 'Tiền cọc'}: ${(Number(lease?.deposit_amount)||0).toLocaleString('vi-VN')}</div>
      </div>
    </div>

    <h2>${t('leaseDetail.activeCharges') || 'Các khoản phí áp dụng'}</h2>
    <table>
      <thead><tr>
        <th>${t('leaseDetail.chargeNamePh') || 'Khoản phí'}</th>
        <th>${t('leasePdf.type') || 'Loại'}</th>
        <th style="text-align:right">${t('leaseDetail.pricePerUnitPh') || 'Đơn giá'}</th>
        <th>${t('leaseDetail.unitPh') || 'Đơn vị'}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="grid" style="margin-top:18px">
      <div class="box">
        <h2>${t('payment.title') || 'Thông tin thanh toán'}</h2>
        ${brandInfo || '<div class="muted">—</div>'}
      </div>
      <div class="box">
        <h2>${t('leasePdf.signatures') || 'Chữ ký'}</h2>
        <div class="grid">
          <div><div class="muted">${t('leasePdf.tenant') || 'Bên thuê'}</div>
            ${sigTenant ? `<img class="sig" src="${sigTenant}"/>` : `<div class="muted sig">(${t('leasePdf.noSignature') || 'Chưa ký'})</div>`}
          </div>
          <div><div class="muted">${t('leasePdf.landlord') || 'Bên cho thuê'}</div>
            ${sigLandlord ? `<img class="sig" src="${sigLandlord}"/>` : `<div class="muted sig">(${t('leasePdf.noSignature') || 'Chưa ký'})</div>`}
          </div>
        </div>
      </div>
    </div>
  </body></html>`;

  // Ưu tiên html-to-pdf nếu có
  const H2P = safeHtmlToPdf();
  if (H2P && typeof H2P.convert === 'function') {
    const res = await H2P.convert({
      html,
      fileName: `lease_${lease?.id || Date.now()}`,
      directory: Platform.OS === 'android' ? 'Documents' : 'Documents',
      base64: false,
    });
    return res.filePath as string;
  }

  // Fallback: Print -> Save as PDF
  const RNPrint = safeRNPrint();
  if (RNPrint && typeof RNPrint.print === 'function') {
    await RNPrint.print({ html });
    return '';
  }

  throw new Error('Không có engine tạo PDF khả dụng.');
}
