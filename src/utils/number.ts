// src/utils/number.ts (mới)
export const onlyDigits = (s: string) => (s || '').replace(/[^\d]/g, '');
export const groupVN   = (s: string) => {
  const n = onlyDigits(s);
  return n ? Number(n).toLocaleString('vi-VN') : '';
};
