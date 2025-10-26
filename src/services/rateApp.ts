// src/services/rateApp.ts
import { Alert, Linking, Platform } from 'react-native';
import InAppReview from 'react-native-in-app-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '../utils/i18nProxy';
/**
 * ✅ HƯỚNG DẪN
 * - Gọi onAppOpened() ở App.tsx mỗi lần app mở (hoặc khi vào Home) để đếm số lần mở.
 * - Khi user làm xong hành động “hài lòng” (trả phòng xong, thanh toán xong, …) gọi markHappyEvent().
 * - Để hiển thị popup đánh giá theo điều kiện → gọi maybeAskForReview().
 * - Nút “Đánh giá ứng dụng” nên gọi maybeAskForReview(true) để ép hiển thị (DEV sẽ hiện Alert fallback).
 */

// ⚙️ THAM SỐ CẦN SỬA CHO APP CỦA BẠN
const ANDROID_PACKAGE_NAME = 'com.yourcompany.yourapp'; // ví dụ: com.mycompany.myapp
const IOS_APP_ID = '6752760921'; // App Store numeric ID, ví dụ: 6471234567

// ⏱ Ngưỡng hỏi tự động
const MIN_DAYS_SINCE_INSTALL = 3;   // ít nhất 3 ngày từ lần mở đầu tiên
const MIN_OPENS = 5;                // ít nhất 5 lần mở app
const HAPPY_EVENTS_THRESHOLD = 2;   // ít nhất 2 “sự kiện hài lòng”
const COOL_DOWN_DAYS = 60;          // không hỏi lại trong vòng 60 ngày

// 🔑 Storage keys
const K_FIRST_OPEN   = 'rateapp.first_open';
const K_OPEN_COUNT   = 'rateapp.open_count';
const K_HAPPY_EVENTS = 'rateapp.happy_events';
const K_LAST_PROMPT  = 'rateapp.last_prompt';
const K_DONT_ASK     = 'rateapp.dont_ask';
const K_RATED        = 'rateapp.has_rated';

// ---------- Storage helpers ----------
async function getNum(key: string, fallback: number): Promise<number> {
  try { const v = await AsyncStorage.getItem(key); return v ? Number(v) : fallback; } catch { return fallback; }
}
async function setNum(key: string, v: number) {
  try { await AsyncStorage.setItem(key, String(v)); } catch {}
}
async function getBool(key: string): Promise<boolean> {
  try { const v = await AsyncStorage.getItem(key); return v === '1' || v === 'true'; } catch { return false; }
}
async function setBool(key: string, v: boolean) {
  try { await AsyncStorage.setItem(key, v ? '1' : '0'); } catch {}
}

// ---------- Date helpers ----------
function daysBetween(tsA: number, tsB: number) {
  const d = Math.abs(tsB - tsA) / (1000 * 60 * 60 * 24);
  return Math.floor(d);
}

// ---------- Public API ----------
/** Gọi khi app mở (hoặc khi user vào màn hình chính) để đếm số lần mở */
export async function onAppOpened() {
  const now = Date.now();
  const first = await getNum(K_FIRST_OPEN, 0);
  if (!first) await setNum(K_FIRST_OPEN, now);
  const opens = await getNum(K_OPEN_COUNT, 0);
  await setNum(K_OPEN_COUNT, opens + 1);
}

/** Gọi khi user có “hành động hài lòng” (ví dụ: tất toán thành công) */
export async function markHappyEvent() {
  const n = await getNum(K_HAPPY_EVENTS, 0);
  await setNum(K_HAPPY_EVENTS, n + 1);
}

/** Cho user chọn “Không hỏi lại” */
export async function neverAskAgain() {
  await setBool(K_DONT_ASK, true);
}

/** Nếu bạn mở store ra rồi → có thể đánh dấu đã đánh giá */
export async function markRated() {
  await setBool(K_RATED, true);
}

/** Dùng trong DEV để test lại luồng */
export async function resetRateAppDevOnly() {
  await AsyncStorage.multiRemove([
    K_FIRST_OPEN, K_OPEN_COUNT, K_HAPPY_EVENTS, K_LAST_PROMPT, K_DONT_ASK, K_RATED,
  ]);
}

// ---------- Store links ----------
async function openStoreReviewPage() {
  try {
    if (Platform.OS === 'android') {
      const marketUrl = `market://details?id=${ANDROID_PACKAGE_NAME}`;
      const webUrl = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`;
      const canOpen = await Linking.canOpenURL(marketUrl);
      await Linking.openURL(canOpen ? marketUrl : webUrl);
    } else {
      const url = `https://apps.apple.com/app/id${IOS_APP_ID}?action=write-review`;
      await Linking.openURL(url);
    }
    await setBool(K_RATED, true);
  } catch {
    // nuốt lỗi mở link
  }
}

export function showFallbackAlert() {
  Alert.alert(
    t('rate.title', 'Đánh giá ứng dụng'),
    t('rate.message', 'Bạn thấy app hữu ích chứ? Vui lòng đánh giá để ủng hộ nhé!'),
    [
      { text: t('rate.later', 'Để sau'), style: 'cancel' },
      {
        text:t('rate.never', 'Không hỏi lại'),
        onPress: async () => { await setBool(K_DONT_ASK, true); },
      },
      {
        text:t('rate.now', 'Đánh giá ngay'),
        onPress: async () => {
          await openStoreReviewPage();
          await setBool(K_DONT_ASK, true);
        },
      },
    ],
    { cancelable: true },
  );
}

/**
 * Hỏi đánh giá:
 * - force = true: bấm nút “Đánh giá ứng dụng” → luôn cố gắng hiển thị ngay.
 *   - DEV hoặc InAppReview không khả dụng → hiện Alert fallback mở thẳng Store.
 *   - Nếu gọi InAppReview được → đặt cờ “dont_ask” để không làm phiền tiếp.
 * - force = false: chỉ hiển thị khi đạt ngưỡng (ngày/đếm mở/sự kiện hài lòng/cooldown).
 */
export async function maybeAskForReview(force = false) {
  const dontAsk = await getBool(K_DONT_ASK);
  const rated = await getBool(K_RATED);
  if (!force && (dontAsk || rated)) return;

  if (force) {
    if (__DEV__ || !InAppReview.isAvailable()) {
      showFallbackAlert();
      return;
    }
    try {
      const ok = await InAppReview.RequestInAppReview();
      if (!ok) {
        // Không đảm bảo hiển thị → có thể fallback cho UX tốt hơn
        showFallbackAlert();
      } else {
        // Nếu đã hiển thị, đặt cờ để không làm phiền
        await setBool(K_DONT_ASK, true);
      }
    } catch {
      showFallbackAlert();
    }
    return;
  }

  // Luồng tự động
  const now = Date.now();
  const first = await getNum(K_FIRST_OPEN, now);
  const opens = await getNum(K_OPEN_COUNT, 0);
  const happy = await getNum(K_HAPPY_EVENTS, 0);
  const lastPromptTs = await getNum(K_LAST_PROMPT, 0);

  const okDays = daysBetween(first, now) >= MIN_DAYS_SINCE_INSTALL;
  const okOpens = opens >= MIN_OPENS;
  const okHappy = happy >= HAPPY_EVENTS_THRESHOLD;
  const coolDownOk = lastPromptTs === 0 || daysBetween(lastPromptTs, now) >= COOL_DOWN_DAYS;

  if (!(okDays && okOpens && okHappy && coolDownOk)) return;
  await setNum(K_LAST_PROMPT, now);

  if (InAppReview.isAvailable()) {
    try {
      const ok = await InAppReview.RequestInAppReview();
      if (ok) await setBool(K_DONT_ASK, true);
    } catch {
      // Không làm gì thêm ở luồng auto (tránh làm phiền)
    }
  }
}
