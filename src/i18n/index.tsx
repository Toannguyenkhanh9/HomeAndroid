import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Lang = 'vi' | 'en';
const LANG_KEY = 'app_lang';

const dict = {
  vi: {
    // common
    add: 'Thêm',
    delete: 'Xoá',
    // nav / modules
    apartments: 'Căn hộ',
    rooms: 'Phòng',
    tenants: 'Người thuê',
    settings: 'Cài đặt',
    reports: 'Báo cáo',
    // apartments
    addApartment: 'Thêm căn hộ',
    searchApartment: 'Tìm kiếm căn hộ...',
    noResults: 'Không tìm thấy kết quả',
    emptyApt: 'Chưa có căn hộ',
    tapAddToCreate: "Nhấn 'Thêm căn hộ' để tạo mới",
    manageActivities: 'QL HĐ',
    // rooms
    roomCode: 'Mã phòng (VD: P201)',
    floor: 'Tầng',
    area: 'Diện tích (m2)',
    addRoom: 'Thêm phòng',
    searchRoom: 'Tìm phòng theo mã/trạng thái...',
    emptyRoom: 'Chưa có phòng',
    roomDetail: 'Chi tiết phòng',
    createLease: 'Tạo hợp đồng',
    contract: 'Hợp đồng',
    startDate: 'Bắt đầu',
    endDate: 'Kết thúc',
    nextDue: 'Ngày thanh toán kỳ tới',
    nearlyEnd: 'Sắp đến ngày kết thúc hợp đồng',
    cycles: 'Chu kỳ thuê',
    paid: 'Đã trả',
    unpaid: 'Chưa trả',
    // tenants
    addTenant: 'Thêm người thuê',
    tenantsEmpty: 'Chưa có người thuê',
    // settings
    language: 'Ngôn ngữ',
    vietnamese: 'Tiếng Việt',
    english: 'English',
    theme: 'Giao diện',
    switchTheme: 'Đổi theme',
    format: 'Định dạng',
    currency: 'Tiền tệ',
    date: 'Ngày',
    notif: 'Thông báo',
    notifHint: 'Android cần quyền POST_NOTIFICATIONS. Nhắc trước hạn 1 ngày lúc 09:00.',
    toggleNotifOn: 'Bật nhắc nhở',
    toggleNotifOff: 'Tắt nhắc nhở',
    backup: 'Sao lưu / Phục hồi',
    exportJson: 'Export JSON',
    importJson: 'Import từ JSON',
    pasteJson: 'Dán JSON để Import...',
    demoData: 'Dữ liệu mẫu',
    createDemo: 'Tạo demo data',
    importedOk: 'Đã import xong',
    leaseForm: 'Tạo hợp đồng',
leaseType: 'Loại hợp đồng',
shortTerm: 'Ngắn hạn',
longTerm: 'Dài hạn',
billingCycle: 'Chu kỳ',
daily: 'Theo ngày',
monthly: 'Theo tháng',
yearly: 'Theo năm',
days: 'Số ngày',
baseRent: 'Giá thuê cơ bản',
deposit: 'Tiền cọc',
save: 'Lưu',
leaseDetail: 'Chi tiết hợp đồng',
charges: 'Các khoản phí',
variable: 'Không cố định',
fixed: 'Cố định',
addCharge: 'Thêm phí',
cycleDetail: 'Chi tiết chu kỳ',
period: 'Kỳ',
status: 'Trạng thái',
payNow: 'Thanh toán',
invoice: 'Hóa đơn',
items: 'Mục phí',
amount: 'Số tiền',
quantity: 'Số lượng',
unitPrice: 'Đơn giá',
total: 'Tổng',
reportsTitle: 'Báo cáo',
year: 'Năm',
month: 'Tháng',
compute: 'Tính',
revenue: 'Doanh thu',
selectFeesToAdd: 'Chọn phí để thêm',
enterVariableFees: 'Nhập các phí không cố định',
addExtraCost: 'Thêm chi phí phát sinh',
close: 'Đóng',
  },
  en: {
    add: 'Add',
    delete: 'Delete',
    apartments: 'Apartments',
    rooms: 'Rooms',
    tenants: 'Tenants',
    settings: 'Settings',
    reports: 'Reports',
    addApartment: 'Add Apartment',
    searchApartment: 'Search apartments...',
    noResults: 'No results',
    emptyApt: 'No apartments',
    tapAddToCreate: "Tap 'Add Apartment' to create",
    manageActivities: 'Ops',
    roomCode: 'Room code (e.g. P201)',
    floor: 'Floor',
    area: 'Area (m²)',
    addRoom: 'Add room',
    searchRoom: 'Search by code/status...',
    emptyRoom: 'No rooms yet',
    roomDetail: 'Room detail',
    createLease: 'Create lease',
    contract: 'Contract',
    startDate: 'Start',
    endDate: 'End',
    nextDue: 'Next due',
    nearlyEnd: 'Almost end of contract',
    cycles: 'Lease cycles',
    paid: 'Paid',
    unpaid: 'Unpaid',
    addTenant: 'Add tenant',
    tenantsEmpty: 'No tenants yet',
    language: 'Language',
    vietnamese: 'Tiếng Việt',
    english: 'English',
    theme: 'Theme',
    switchTheme: 'Switch theme',
    format: 'Format',
    currency: 'Currency',
    date: 'Date',
    notif: 'Notifications',
    notifHint: 'Android needs POST_NOTIFICATIONS permission. Reminder 1 day before at 09:00.',
    toggleNotifOn: 'Enable reminders',
    toggleNotifOff: 'Disable reminders',
    backup: 'Backup / Restore',
    exportJson: 'Export JSON',
    importJson: 'Import from JSON',
    pasteJson: 'Paste JSON to import...',
    demoData: 'Sample data',
    createDemo: 'Create demo data',
    importedOk: 'Import done',
    leaseForm: 'Create lease',
leaseType: 'Lease type',
shortTerm: 'Short-term',
longTerm: 'Long-term',
billingCycle: 'Billing cycle',
daily: 'Daily',
monthly: 'Monthly',
yearly: 'Yearly',
days: 'Days',
baseRent: 'Base rent',
deposit: 'Deposit',
save: 'Save',
leaseDetail: 'Lease detail',
charges: 'Charges',
variable: 'Variable',
fixed: 'Fixed',
addCharge: 'Add charge',
cycleDetail: 'Cycle detail',
period: 'Period',
status: 'Status',
payNow: 'Pay now',
invoice: 'Invoice',
items: 'Items',
amount: 'Amount',
quantity: 'Qty',
unitPrice: 'Unit price',
total: 'Total',
reportsTitle: 'Reports',
year: 'Year',
month: 'Month',
compute: 'Compute',
revenue: 'Revenue',
selectFeesToAdd: 'Select fees to add',
enterVariableFees: 'Enter variable fees',
addExtraCost: 'Add extra cost',
close: 'Close',
  },
} as const;

type I18nCtx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: keyof typeof dict['vi']) => string;
  ready: boolean;
};

const Ctx = createContext<I18nCtx>({lang: 'vi', setLang: () => {}, t: k => String(k), ready: false});

export function I18nProvider({children}: {children: React.ReactNode}) {
  const [lang, setLangState] = useState<Lang>('vi');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = (await AsyncStorage.getItem(LANG_KEY)) as Lang | null;
      if (saved === 'vi' || saved === 'en') setLangState(saved);
      setReady(true);
    })();
  }, []);

  const setLang = async (l: Lang) => {
    setLangState(l);
    await AsyncStorage.setItem(LANG_KEY, l);
  };

  const value = useMemo<I18nCtx>(() => {
    const table = dict[lang];
    return {lang, setLang, t: (k) => (table as any)[k] ?? String(k), ready};
  }, [lang, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() { return useContext(Ctx); }
