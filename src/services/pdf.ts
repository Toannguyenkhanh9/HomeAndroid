import RNHTMLtoPDF from 'react-native-html-to-pdf';
import {getInvoice, getInvoiceItems} from './rent';
export async function exportInvoicePdf(invoiceId: string) {
  const inv = getInvoice(invoiceId); const items = getInvoiceItems(invoiceId);
  const rows = items.map((it:any)=> `<tr><td style="padding:6px;border:1px solid #e5e7eb">${it.description}</td><td style="padding:6px;border:1px solid #e5e7eb">${it.quantity}</td><td style="padding:6px;border:1px solid #e5e7eb">${it.unit||''}</td><td style="padding:6px;border:1px solid #e5e7eb;text-align:right">${(it.unit_price||0).toLocaleString('vi-VN')}</td><td style="padding:6px;border:1px solid #e5e7eb;text-align:right">${(it.amount||0).toLocaleString('vi-VN')}</td></tr>`).join('');
  const html = `<html><head><meta charset="utf-8" /></head><body style="font-family:-apple-system,Arial;padding:16px"><h2>Hóa đơn thuê phòng</h2><div>Kỳ: <b>${inv.period_start}</b> → <b>${inv.period_end}</b></div><div>Trạng thái: ${inv.status}</div><table style="border-collapse:collapse;width:100%;margin-top:12px"><thead><tr><th style="padding:6px;border:1px solid #e5e7eb;text-align:left">Khoản</th><th style="padding:6px;border:1px solid #e5e7eb">SL</th><th style="padding:6px;border:1px solid #e5e7eb">ĐVT</th><th style="padding:6px;border:1px solid #e5e7eb">Đơn giá</th><th style="padding:6px;border:1px solid #e5e7eb">Thành tiền</th></tr></thead><tbody>${rows}</tbody></table><h3 style="text-align:right;margin-top:12px">Tổng: ${inv.total.toLocaleString('vi-VN')} đ</h3></body></html>`;
  const res = await RNHTMLtoPDF.convert({ html, fileName: `invoice_${inv.period_start}_${inv.period_end}`.replace(/[^a-zA-Z0-9_\-]/g,'_'), base64: false }); return res.filePath;
}
export async function exportReceiptPdf(invoiceId: string) {
  const inv = getInvoice(invoiceId);
  const html = `<html><head><meta charset="utf-8" /></head><body style="font-family:-apple-system,Arial;padding:16px"><h2>Biên nhận thanh toán</h2><div>Cho kỳ thuê: <b>${inv.period_start}</b> → <b>${inv.period_end}</b></div><div>Ngày: ${new Date().toISOString().slice(0,10)}</div><div>Đã nhận: <b>${inv.total.toLocaleString('vi-VN')} đ</b></div></body></html>`;
  const res = await RNHTMLtoPDF.convert({ html, fileName: `receipt_${inv.period_start}_${inv.period_end}`.replace(/[^a-zA-Z0-9_\-]/g,'_'), base64: false }); return res.filePath;
}
