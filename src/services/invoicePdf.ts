import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import RNFS from 'react-native-fs';

type Inv = { id: string; period_start: string; period_end: string; total: number };
type Item = {
  description: string;
  quantity?: number;
  unit?: string | null;
  unit_price: number;
  amount: number;
  meta_json?: string | null;
};

export async function createInvoicePdfFile(
  inv: Inv,
  items: Item[],
  t: (k: string, p?: any) => string,
  format: (n: number) => string,
): Promise<string> {
  // 1) Tạo doc + fonts
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 (pt)
  const { width } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // helpers
  const sizeTitle = 18;
  const sizeText = 11;
  let y = 800;
  const margin = 40;

  const drawText = (text: string, x: number, y2: number, bold = false, size = sizeText) => {
    page.drawText(text, {
      x, y: y2, size, font: bold ? fontBold : font, color: rgb(0,0,0),
    });
  };

  const drawRight = (text: string, xRight: number, y2: number, bold = false, size = sizeText) => {
    const w = (bold ? fontBold : font).widthOfTextAtSize(text, size);
    drawText(text, xRight - w, y2, bold, size);
  };

  // 2) Header
  drawText(`${t('cycleDetail.invoiceTitle')} ${inv.period_start} → ${inv.period_end}`, margin, y, true, sizeTitle);
  y -= 28;

  // 3) Bảng
  const colX = [margin, margin + 280, margin + 360, margin + 440, width - margin]; // item / qty / unitPrice / amount (align right)
  const rowH = 18;

  // header row
  page.drawLine({ start: { x: margin, y: y+rowH+6 }, end: { x: width-margin, y: y+rowH+6 }, thickness: 0.7, color: rgb(0.7,0.7,0.7) });
  drawText(t('cycleDetail.item'), colX[0], y, true);
  drawRight(t('cycleDetail.qty'), colX[2]-12, y, true);
  drawRight(t('cycleDetail.unitPrice'), colX[3]-12, y, true);
  drawRight(t('cycleDetail.amount'), colX[4], y, true);
  y -= rowH;

  // rows
  items.forEach(it => {
    // mô tả + extra info
    let desc = it.description;
    if (it.meta_json) {
      try {
        const m = JSON.parse(it.meta_json);
        const extras: string[] = [];
        if (typeof m?.meter_start === 'number' && typeof m?.meter_end === 'number') {
          extras.push(`${t('cycleDetail.prevIndex')}: ${m.meter_start} • ${t('cycleDetail.currIndex')}: ${m.meter_end}`);
        }
        if (m?.for_period_start && m?.for_period_end) {
          extras.push(`${t('cycleDetail.forPeriod')}: ${m.for_period_start} → ${m.for_period_end}`);
        }
        if (extras.length) desc += `\n${extras.join('\n')}`;
      } catch {}
    }

    // vẽ mô tả (có thể 2 dòng)
    const lines = desc.split('\n');
    drawText(lines[0], colX[0], y);
    if (lines[1]) {
      y -= rowH - 6;
      drawText(lines[1], colX[0], y, false, 10);
      y -= 6;
    }

    drawRight(`${it.quantity ?? 1} ${it.unit ?? ''}`, colX[2]-12, y);
    drawRight(format(it.unit_price), colX[3]-12, y);
    drawRight(format(it.amount), colX[4], y);
    y -= rowH;

    if (y < 80) { // new page nếu gần hết trang
      page.drawLine({ start: { x: margin, y: y+rowH }, end: { x: width-margin, y: y+rowH }, thickness: 0.5, color: rgb(0.8,0.8,0.8) });
      y = 800;
    }
  });

  // footer total
  page.drawLine({ start: { x: margin, y: y+6 }, end: { x: width-margin, y: y+6 }, thickness: 0.7, color: rgb(0.7,0.7,0.7) });
  drawRight(t('cycleDetail.total'), colX[3]-12, y-2, true);
  drawRight(format(inv.total), colX[4], y-2, true);

  // 4) Lưu file
  const base64 = await pdf.saveAsBase64();
  const path = `${RNFS.CachesDirectoryPath}/invoice_${inv.id}.pdf`;
  await RNFS.writeFile(path, base64, 'base64');
  return path;
}
