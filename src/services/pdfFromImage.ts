// src/services/pdfFromImage.ts
// Biến PNG/JPG (đường dẫn file) -> PDF đa trang A4 bằng pdf-lib (JS thuần)

import RNFS from 'react-native-fs';
import { PDFDocument } from 'pdf-lib';

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function base64ToUint8Array(base64: string): Uint8Array {
  let clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  let bufferLength = clean.length * 0.75;
  if (clean.endsWith('==')) bufferLength -= 2;
  else if (clean.endsWith('=')) bufferLength -= 1;
  const bytes = new Uint8Array(bufferLength);
  let p = 0;

  for (let i = 0; i < clean.length; i += 4) {
    const enc1 = B64_CHARS.indexOf(clean[i]);
    const enc2 = B64_CHARS.indexOf(clean[i + 1]);
    const enc3 = B64_CHARS.indexOf(clean[i + 2]);
    const enc4 = B64_CHARS.indexOf(clean[i + 3]);

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    bytes[p++] = chr1;
    if (enc3 !== 64 && clean[i + 2] !== '=') bytes[p++] = chr2;
    if (enc4 !== 64 && clean[i + 3] !== '=') bytes[p++] = chr3;
  }
  return bytes;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let output = '';
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const a = bytes[i++] ?? 0;
    const b = bytes[i++] ?? 0;
    const c = bytes[i++] ?? 0;
    const triplet = (a << 16) | (b << 8) | c;

    output += B64_CHARS[(triplet >> 18) & 63];
    output += B64_CHARS[(triplet >> 12) & 63];
    output += B64_CHARS[(triplet >> 6) & 63];
    output += B64_CHARS[triplet & 63];
  }
  const pad = len % 3;
  if (pad === 1) output = output.slice(0, -2) + '==';
  else if (pad === 2) output = output.slice(0, -1) + '=';
  return output;
}

export async function createPdfFromImageFile(
  imagePath: string,
  opts?: {
    page?: 'A4' | { width: number; height: number }; // pt (1/72 inch)
    margin?: number;     // pt
  }
): Promise<string> {
  // 1) Đọc ảnh dạng base64
  const b64 = await RNFS.readFile(imagePath, 'base64');
  const bytes = base64ToUint8Array(b64);

  // 2) Tạo PDF
  const pdf = await PDFDocument.create();

  // 3) Nhúng ảnh (tự nhận PNG/JPG)
  let img: any;
  try {
    img = await pdf.embedPng(bytes);
  } catch {
    img = await pdf.embedJpg(bytes);
  }
  const imgW = img.width;
  const imgH = img.height;

  // 4) Thiết lập trang A4 + lề
  const A4 = { width: 595.28, height: 841.89 };
  const margin = opts?.margin ?? 24;
  const pageSize =
    opts?.page === 'A4' || !opts?.page
      ? A4
      : (opts.page as { width: number; height: number });
  const printableW = pageSize.width - margin * 2;
  const printableH = pageSize.height - margin * 2;

  // 5) Scale ảnh theo chiều ngang, chia nhiều trang nếu quá cao
  const scale = printableW / imgW;
  const scaledH = imgH * scale;
  const pages = Math.max(1, Math.ceil(scaledH / printableH));

  for (let i = 0; i < pages; i++) {
    const page = pdf.addPage([pageSize.width, pageSize.height]);
    // Vẽ cùng 1 ảnh, đẩy xuống mỗi trang để "cắt" phần đã hiển thị
    const y = margin - i * printableH;
    page.drawImage(img, {
      x: margin,
      y,
      width: printableW,
      height: scaledH,
    });
  }

  const pdfBytes = await pdf.save();
  const pdfB64 = uint8ToBase64(pdfBytes);

  const out = `${RNFS.CachesDirectoryPath}/invoice_${Date.now()}.pdf`;
  await RNFS.writeFile(out, pdfB64, 'base64');
  return out;
}
