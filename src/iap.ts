import { Platform } from 'react-native';
import * as RNIap from 'react-native-iap';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PaidPlanId = 'starter' | 'pro';
export type PlanId = 'free' | PaidPlanId;

const SUBS_SKUS = [
  'starter_monthly',
  'starter_yearly',
  'com.kevingroup.leasea.pro_monthly',
  'com.kevingroup.leasea.pro_yearly',
];

const STORAGE_KEY = 'leasea.subscription';

let purchaseUpdateSub: RNIap.PurchaseUpdatedListener | null = null;
let purchaseErrorSub: RNIap.PurchaseErrorListener | null = null;

export type SubscriptionState = {
  plan: PlanId;
  sku?: string;
  transactionId?: string;
  purchaseDate?: string;
};

export async function initIAP() {
  try {
    await RNIap.initConnection();
    if (Platform.OS === 'android') {
      await RNIap.flushFailedPurchasesCachedAsPendingAndroid();
    }

    // listeners để khi mua xong thì lưu trạng thái
    if (!purchaseUpdateSub) {
      purchaseUpdateSub = RNIap.purchaseUpdatedListener(async (purchase) => {
        try {
          if (purchase.transactionReceipt) {
            await RNIap.finishTransaction(purchase);
            await syncFromStore();
          }
        } catch (e) {
          console.log('finishTransaction error', e);
        }
      });
    }

    if (!purchaseErrorSub) {
      purchaseErrorSub = RNIap.purchaseErrorListener((err) => {
        console.log('purchaseError', err);
      });
    }

    // lần đầu mở app: đồng bộ lại để biết user đang ở gói nào
    await syncFromStore();
  } catch (e) {
    console.log('initIAP error', e);
  }
}

export function endIAP() {
  purchaseUpdateSub?.remove();
  purchaseErrorSub?.remove();
  purchaseUpdateSub = null;
  purchaseErrorSub = null;
  RNIap.endConnection();
}

// Đọc trạng thái đã lưu (nếu không có => free)
export async function getSavedSubscription(): Promise<SubscriptionState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { plan: 'free' };
}

// Đồng bộ từ store (sandbox / real device)
export async function syncFromStore(): Promise<SubscriptionState> {
  try {
    const purchases = await RNIap.getAvailablePurchases();
    const sub = purchases.find(p => SUBS_SKUS.includes(p.productId));

    if (sub) {
      const id = sub.productId;
      const plan: PlanId =
        id.includes('pro') ? 'pro' :
        id.includes('starter') ? 'starter' :
        'free';

      const state: SubscriptionState = {
        plan,
        sku: id,
        transactionId: sub.transactionId,
        purchaseDate: sub.transactionDate,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return state;
    }

    const freeState: SubscriptionState = { plan: 'free' };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(freeState));
    return freeState;
  } catch (e) {
    console.log('syncFromStore error', e);
    return getSavedSubscription();
  }
}

// Mua gói
export async function buyPlan(plan: PaidPlanId, yearly: boolean) {
  let productId: string | null = null;

  if (plan === 'starter') {
    productId = yearly ? 'com.kevingroup.leasea.starter_yearly' : 'com.kevingroup.leasea.starter_monthly';
  } else if (plan === 'pro') {
    productId = yearly
      ? 'com.kevingroup.leasea.pro_yearly'
      : 'com.kevingroup.leasea.pro_monthly';
  }

  if (!productId) throw new Error('Invalid plan');

  // Với v14.4.38 vẫn dùng cách này được
  await RNIap.requestSubscription(productId);
}

// Khôi phục mua hàng (nút "Restore")
export async function restorePurchases() {
  return syncFromStore();
}
