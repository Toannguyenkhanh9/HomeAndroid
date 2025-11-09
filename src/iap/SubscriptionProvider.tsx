// src/iap/SubscriptionProvider.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import * as RNIap from 'react-native-iap';
import {
  initIAP,
  handlePurchase,
  loadSubscriptionState,
  purchasePlan,
  restoreSubscriptions,
} from './iapService';
import { PlanId, BillingPeriod } from './products';

type Ctx = {
  state: {
    plan: PlanId;
    period: BillingPeriod | null;
  };
  loading: boolean;
  buy: (plan: PlanId, period: BillingPeriod) => Promise<void>;
  restore: () => Promise<void>;
};

const SubscriptionContext = createContext<Ctx | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<{ plan: PlanId; period: BillingPeriod | null }>({
    plan: 'free',
    period: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let purchaseUpdateSub: RNIap.PurchaseUpdatedListener | null = null;
    let purchaseErrorSub: RNIap.PurchaseErrorListener | null = null;

    (async () => {
      await initIAP();
      const saved = await loadSubscriptionState();
      setState({ plan: saved.plan, period: saved.period });

      purchaseUpdateSub = RNIap.purchaseUpdatedListener(async purchase => {
        if (!purchase) return;
        await handlePurchase(purchase);
        const newState = await loadSubscriptionState();
        setState({ plan: newState.plan, period: newState.period });
      });

      purchaseErrorSub = RNIap.purchaseErrorListener(error => {
        console.warn('purchase error', error);
      });

      setLoading(false);
    })();

    return () => {
      purchaseUpdateSub?.remove();
      purchaseErrorSub?.remove();
      RNIap.endConnection();
    };
  }, []);

  const buy = async (plan: PlanId, period: BillingPeriod) => {
    setLoading(true);
    try {
      await purchasePlan(plan, period);
      // kết quả thực xử lý trong listener purchaseUpdatedListener
    } finally {
      setLoading(false);
    }
  };

  const restore = async () => {
    setLoading(true);
    try {
      await restoreSubscriptions();
      const s = await loadSubscriptionState();
      setState({ plan: s.plan, period: s.period });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SubscriptionContext.Provider value={{ state, loading, buy, restore }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
