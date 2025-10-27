import AsyncStorage from '@react-native-async-storage/async-storage';

export type PaymentProfile = {
  brandName?: string;      // Tên thương hiệu/cửa hàng
  bankName?: string;    
  bankBin?: string;      // Tên ngân hàng
  accountName?: string;    // Chủ tài khoản
  accountNumber?: string;  // Số tài khoản
  note?: string;           // Ghi chú/chuyển khoản nội dung
  logoPath?: string;       // file://... (ảnh logo)
  qrPath?: string;         // file://... (ảnh QR)
};

const STORAGE_KEY = 'payment_profile_v1';

export async function loadPaymentProfile(): Promise<PaymentProfile> {
  try {
    const s = await AsyncStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

export async function savePaymentProfile(p: PaymentProfile) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export async function clearPaymentProfile() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
