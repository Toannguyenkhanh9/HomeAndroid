// src/services/vietqr.ts
// Build payload VietQR theo EMVCo + Napas (QRIBFTTA)

type BuildArgs = {
  bin: string;                 // BIN ngân hàng (VD: 970422 cho Techcombank)
  accountNumber: string;       // Số tài khoản nhận
  accountName?: string;        // Tên tài khoản (tùy chọn)
  amount?: number;             // Số tiền (VND)
  addInfo?: string;            // Nội dung chuyển khoản (invoiceCode)
  isDynamic?: boolean;         // 11: dynamic (mặc định), 12: static
};

const tlv = (id: string, value: string) =>
  `${id}${String(value.length).padStart(2, '0')}${value}`;

function crc16ccitt(input: string) {
  // CRC-16/CCITT-FALSE
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildVietQRPayload({
  bin,
  accountNumber,
  accountName,
  amount,
  addInfo,
  isDynamic = true,
}: BuildArgs) {
  // 00: Payload Format Indicator
  let s = tlv('00', '01');
  // 01: Point of Initiation Method (11 = dynamic, 12 = static)
  s += tlv('01', isDynamic ? '11' : '12');

  // 38: Merchant Account Information (Napas VietQR)
  //   00: AID = A000000727
  //   01: Service = QRIBFTTA (chuyển nhanh 24/7 tới tài khoản)
  //   02: BIN
  //   03: Account number
  //   04: Account name (optional)
  const mai =
    tlv('00', 'A000000727') +
    tlv('01', 'QRIBFTTA') +
    tlv('02', String(bin)) +
    tlv('03', String(accountNumber)) +
    (accountName ? tlv('04', accountName) : '');
  s += tlv('38', mai);

  // 53: Currency (704 = VND)
  s += tlv('53', '704');

  // 54: Amount (optional)
  if (amount && amount > 0) s += tlv('54', String(amount));

  // 58: Country Code
  s += tlv('58', 'VN');

  // 59: Merchant Name (optional -> dùng accountName nếu có)
  if (accountName) s += tlv('59', accountName.slice(0, 25));

  // 62: Additional Data Field (Bill Number/Ref)
  if (addInfo && addInfo.trim()) {
    // dùng 01 = Bill Number cho nội dung CK (invoiceCode)
    const ad = tlv('01', addInfo);
    s += tlv('62', ad);
  }

  // 63: CRC (tính trên toàn bộ chuỗi kèm '63' + '04')
  const forCRC = s + '6304';
  const crc = crc16ccitt(forCRC);
  s += tlv('63', crc);

  return s;
}

// vài BIN phổ biến (tuỳ bạn mở rộng)
export const BANK_BINS: Record<string, string> = {
  TCB: '970407', // Techcombank
  VCB: '970436', // Vietcombank
  BIDV: '970418',
  CTG: '970415', // VietinBank
  ACB: '970416',
  MB: '970422',
  VPB: '970432',
  TPB: '970423',
  VIB: '970441',
};
