// src/iap/products.ts
export type PlanId = 'free' | 'starter' | 'pro' | 'enterprise';
export type BillingPeriod = 'monthly' | 'yearly';

type ProductMap = {
  [P in Exclude<PlanId, 'free' | 'enterprise'>]: {
    monthly: string;
    yearly: string;
  };
};

export const PLAN_PRODUCT_IDS: ProductMap = {
  starter: {
    monthly: 'starter_monthly',
    yearly: 'starter_yearly',
  },
  pro: {
    monthly: 'pro_monthly',
    yearly: 'pro_yearly',
  },
};

export function getProductId(
  plan: PlanId,
  period: BillingPeriod,
): string | null {
  if (plan === 'enterprise' || plan === 'free') return null;
  return PLAN_PRODUCT_IDS[plan]?.[period] ?? null;
}
