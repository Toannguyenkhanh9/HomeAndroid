// src/iap/iapService.ts
import { Platform } from 'react-native';
import * as RNIap from 'react-native-iap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProductId, PlanId, BillingPeriod } from './products';

const STORAGE_KEY = 'subscription_state_v1';

// Định nghĩa state lưu lại
export type SubscriptionState = {
  plan: PlanId;
  period: BillingPeriod | null;
  expiryDate?: string | null;    // optional, nếu backend/receipt cung cấp
};

let isInited = false;

export async function initIAP() {
  if (isInited) return;
  await RNIap.initConnection();
  if (Platform.OS === 'android') {
    try {
      await RNIap.flushFailedPurchasesCachedAsPendingAndroid();
    } catch {}
  }
  isInited = true;
}

export async function getAvailableSubscriptions() {
  await initIAP();
  const skus: string[] = [];
  Object.values(PLAN_PRODUCT_IDS).forEach(p => {
    skus.push(p.monthly, p.yearly);
  });

  // API mới: truyền { skus }
  const subs = await RNIap.getSubscriptions({ skus });
  return subs;
}

/**
 * Lưu plan sau khi đã verify (ở đây demo: verify sơ bộ trên client).
 */
async function saveSubscriptionState(state: SubscriptionState) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function loadSubscriptionState(): Promise<SubscriptionState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { plan: 'free', period: null };
    const parsed = JSON.parse(raw);
    return {
      plan: parsed.plan ?? 'free',
      period: parsed.period ?? null,
      expiryDate: parsed.expiryDate ?? null,
    };
  } catch {
    return { plan: 'free', period: null };
  }
}

/**
 * Xử lý khi có purchase thành công.
 * Ở bản production bạn NÊN gửi purchase lên server để verify (App Store/Play API) rồi mới set plan.
 */
export async function handlePurchase(purchase: RNIap.Purchase) {
  try {
    const receipt = purchase.transactionReceipt;
    if (!receipt) return;

    // TODO: gọi API backend để verify, kiểu:
    // const { plan, period, expiryDate } = await api.verifyReceipt(purchase);
    // DEMO: tự map từ productId local

    const productId = purchase.productId;
    let plan: PlanId = 'free';
    let period: BillingPeriod | null = null;

    if (productId === 'starter_monthly') {
      plan = 'starter';
      period = 'monthly';
    } else if (productId === 'starter_yearly') {
      plan = 'starter';
      period = 'yearly';
    } else if (productId === 'pro_monthly') {
      plan = 'pro';
      period = 'monthly';
    } else if (productId === 'pro_yearly') {
      plan = 'pro';
      period = 'yearly';
    }

    await saveSubscriptionState({ plan, period });

    // iOS: xác nhận
    if (Platform.OS === 'ios') {
      await RNIap.finishTransactionIOS(purchase.transactionId);
    }
    // Android + iOS: common
    await RNIap.finishTransaction({ purchase, isConsumable: false });
  } catch (e) {
    console.log('handlePurchase error', e);
  }
}

/**
 * Gọi khi user bấm mua gói.
 */
export async function purchasePlan(plan: PlanId, period: BillingPeriod) {
  if (plan === 'free') {
    await saveSubscriptionState({ plan: 'free', period: null });
    return;
  }
  if (plan === 'enterprise') {
    // Tùy bạn: mở link, màn hình contact,...
    return;
  }

  const productId = getProductId(plan, period);
  if (!productId) throw new Error('Product ID not configured');

  await initIAP();

  await RNIap.requestSubscription({
    sku: productId,
    // với Android basePlan/offer mới, thêm subscriptionOffers nếu cần
  });
}

/**
 * Khôi phục mua (Restore purchases)
 * - iOS: bắt buộc có nút.
 * - Android: cũng có thể dùng để sync lại.
 */
export async function restoreSubscriptions() {
  await initIAP();
  const history = await RNIap.getAvailablePurchases();

  // Đơn giản: lấy purchase mới nhất thuộc các SKU của mình
  const ours = history.filter(p =>
    ['starter_monthly', 'starter_yearly', 'pro_monthly', 'pro_yearly']
      .includes(p.productId),
  );
  if (!ours.length) {
    await saveSubscriptionState({ plan: 'free', period: null });
    return { plan: 'free', period: null };
  }

  // lấy purchase gần nhất
  ours.sort((a, b) => (b.transactionDate || 0) - (a.transactionDate || 0));
  const latest = ours[0];
  await handlePurchase(latest);
  return loadSubscriptionState();
}
