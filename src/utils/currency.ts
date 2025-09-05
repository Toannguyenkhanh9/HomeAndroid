export type Currency = 'VND'|'USD';
export function formatMoney(n:number, currency: Currency){
  if (currency === 'USD') return `$${(n/100).toFixed(2)}`; // assume cents for demo
  return (n||0).toLocaleString('vi-VN');
}
