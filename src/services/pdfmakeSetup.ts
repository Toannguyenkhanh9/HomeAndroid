// CẤU HÌNH DUY NHẤT CHO PDFMAKE
import pdfMake from 'pdfmake/build/pdfmake';
import * as vfsFonts from 'pdfmake/build/vfs_fonts';

// Lấy vfs an toàn cho mọi kiểu bundle
const vfs =
  (vfsFonts as any)?.pdfMake?.vfs ||
  (vfsFonts as any)?.default?.pdfMake?.vfs;

if (!vfs) {
  // Nếu rơi vào đây, chắc chắn import vfs_fonts bị sai -> reset cache/bundle
  throw new Error('pdfmake vfs not loaded');
}

// GÁN VFS CHO PDFMAKE
(pdfMake as any).vfs = vfs;

// Chỉ có 3 file trong vfs_fonts: Regular, Medium, Italic
// -> dùng Medium làm bold, Italic làm bolditalics (fallback)
;(pdfMake as any).fonts = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-Italic.ttf',
  },
};

export default pdfMake;
