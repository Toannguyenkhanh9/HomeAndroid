import {createApartment, createRoom, startLeaseAdvanced} from './rent';
export function seedDemo() {
  const apt1 = createApartment('Hoa Binh Tower', '123 Trần Hưng Đạo');
  const apt2 = createApartment('Sunshine Home', '45 Lê Lợi');
  const r1 = createRoom(apt1, 'P101', 1, 20);
  const r2 = createRoom(apt1, 'P102', 1, 18);
  const r3 = createRoom(apt2, 'A201', 2, 24);
  const lease1 = startLeaseAdvanced({
    roomId: r1, leaseType: 'long_term', billing: 'monthly',
    startDateISO: new Date().toISOString().slice(0,10), baseRent: 3000000, deposit: 500000,
    isAllInclusive: false,
    charges: [
      {name:'Tiền phòng', type:'fixed', unit:'kỳ', unitPrice:3000000},
      {name:'Điện', type:'variable', unit:'kWh', unitPrice:null},
      {name:'Nước', type:'variable', unit:'m3', unitPrice:null},
      {name:'Internet', type:'fixed', unit:'kỳ', unitPrice:120000}
    ],
    tenant: {full_name: 'Nguyễn Văn A', phone: '0901 234 567'}
  });
  const lease2 = startLeaseAdvanced({
    roomId: r2, leaseType: 'short_term', billing: 'daily',
    startDateISO: new Date().toISOString().slice(0,10), baseRent: 500000, deposit: 0, durationDays: 7,
    isAllInclusive: true, tenant: {full_name: 'Trần Thị B', phone:'0987 654 321'}
  });
  const lease3 = startLeaseAdvanced({
    roomId: r3, leaseType: 'long_term', billing: 'yearly',
    startDateISO: new Date().toISOString().slice(0,10), baseRent: 36000000, deposit: 2000000,
    isAllInclusive: false, charges: [
      {name:'Tiền phòng', type:'fixed', unit:'kỳ', unitPrice:36000000},
      {name:'Rác', type:'fixed', unit:'kỳ', unitPrice:50000},
      {name:'Gửi xe', type:'fixed', unit:'kỳ', unitPrice:100000}
    ],
    tenant: {full_name: 'Phạm Văn C', phone: '0912 000 111'}
  });
  return {apt1, apt2, lease1, lease2, lease3};
}
