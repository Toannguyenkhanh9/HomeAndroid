// src/screens/PricingPlans.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator, Alert, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import Card from '../components/Card';
import { useThemeColors } from '../theme';
import { useSubscription } from '../iap/SubscriptionProvider';
import type { PlanId } from '../iap/products';

export default function PricingPlans() {
  const { t } = useTranslation();
  const c = useThemeColors();
  const [yearly, setYearly] = useState(true);
  const [compareOpen, setCompareOpen] = useState(false);
  const { state, loading, buy, restore } = useSubscription();

  const fmt = (n: number) =>
    n === 0
      ? t('pricing.freeTag')
      : n.toLocaleString('vi-VN') + t('pricing.currencySuffix');

  const priceLabel = (id: PlanId, m: number, y: number) => {
    if (id === 'enterprise') return t('pricing.contact');
    return yearly
      ? `${fmt(y)} ${t('pricing.perYear')}`
      : `${fmt(m)} ${t('pricing.perMonth')}`;
  };

  const plans = useMemo(
    () => [
      {
        id: 'free' as PlanId,
        name: t('pricing.free.name'),
        icon: '🎁',
        monthly: 0,
        yearly: 0,
        features: t<string[]>('pricing.free.features', { returnObjects: true }),
        cta: t('pricing.free.cta'),
      },
      {
        id: 'starter' as PlanId,
        name: t('pricing.starter.name'),
        icon: '🌱',
        monthly: 49000,
        yearly: 499000,
        features: t<string[]>('pricing.starter.features', { returnObjects: true }),
        cta: t('pricing.starter.cta'),
      },
      {
        id: 'pro' as PlanId,
        name: t('pricing.pro.name'),
        icon: '🚀',
        monthly: 99000,
        yearly: 999000,
        features: t<string[]>('pricing.pro.features', { returnObjects: true }),
        cta: t('pricing.pro.cta'),
        highlight: true,
      },
      {
        id: 'enterprise' as PlanId,
        name: t('pricing.enterprise.name'),
        icon: '🏢',
        monthly: 0,
        yearly: 0,
        features: t<string[]>('pricing.enterprise.features', { returnObjects: true }),
        cta: t('pricing.enterprise.cta'),
        contact: true,
      },
    ],
    [t, yearly],
  );

  const onSelectPlan = async (id: PlanId) => {
    if (id === 'enterprise') {
      // mở mail / link liên hệ
      Linking.openURL('mailto:support@yourapp.com');
      return;
    }

    try {
      const period = yearly ? 'yearly' : 'monthly';
      await buy(id, period);
      // Nếu muốn show message sau khi listener set state:
      const label =
        id === 'free'
          ? t('pricing.activatedFree')
          : t('pricing.activatedPaid');
      Alert.alert(t('pricing.successTitle'), label);
    } catch (e: any) {
      console.log('select plan error', e);
      Alert.alert(t('pricing.errorTitle'), e?.message || 'Purchase failed');
    }
  };

  const onRestore = async () => {
    try {
      await restore();
      Alert.alert(t('pricing.restoreTitle'), t('pricing.restoreDone'));
    } catch (e: any) {
      Alert.alert(t('pricing.errorTitle'), e?.message || 'Restore failed');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Card style={{ padding: 16 }}>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 18 }}>
            {t('pricing.title')}
          </Text>
          <Text style={{ color: c.subtext, marginTop: 6 }}>
            {t('pricing.subtitle')}
          </Text>

          {/* Toggle month/year */}
          <View
            style={{
              flexDirection: 'row',
              alignSelf: 'center',
              marginTop: 12,
              backgroundColor: c.card,
              borderRadius: 999,
              padding: 4,
              gap: 4,
            }}
          >
            <TouchableOpacity
              onPress={() => setYearly(false)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: yearly ? 'transparent' : '#22C55E',
              }}
            >
              <Text
                style={{
                  color: yearly ? c.text : '#fff',
                  fontWeight: '700',
                }}
              >
                {t('pricing.payMonthly')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setYearly(true)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: yearly ? '#22C55E' : 'transparent',
              }}
            >
              <Text
                style={{
                  color: yearly ? '#fff' : c.text,
                  fontWeight: '700',
                }}
              >
                {t('pricing.payYearly')}
              </Text>
            </TouchableOpacity>
          </View>
        </Card>

        {plans.map(p => {
          const isCurrent = state.plan === p.id && p.id !== 'enterprise';
          return (
            <Card
              key={p.id}
              style={{
                borderWidth: p.highlight ? 2 : 1,
                borderColor: p.highlight ? '#22C55E' : c.card,
                padding: 16,
                opacity: loading && isCurrent ? 0.6 : 1,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, marginRight: 8 }}>{p.icon}</Text>
                  <Text
                    style={{
                      color: c.text,
                      fontWeight: '800',
                      fontSize: 18,
                    }}
                  >
                    {p.name}
                  </Text>
                  {p.highlight ? (
                    <View
                      style={{
                        marginLeft: 8,
                        backgroundColor: '#d1fae5',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 999,
                      }}
                    >
                      <Text
                        style={{ color: '#065f46', fontWeight: '700' }}
                      >
                        {t('pricing.mostPopular')}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      color: c.text,
                      fontWeight: '800',
                      fontSize: 16,
                    }}
                  >
                    {priceLabel(p.id, p.monthly, p.yearly)}
                  </Text>
                  {isCurrent && (
                    <Text
                      style={{
                        marginTop: 2,
                        fontSize: 11,
                        color: '#22C55E',
                        fontWeight: '600',
                      }}
                    >
                      {t('pricing.currentPlan')}
                    </Text>
                  )}
                </View>
              </View>

              <View style={{ gap: 6, marginTop: 8 }}>
                {p.features.map((f, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{ color: '#22C55E', marginRight: 6 }}
                    >
                      •
                    </Text>
                    <Text style={{ color: c.text }}>{f}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                onPress={() => onSelectPlan(p.id)}
                disabled={loading}
                style={{
                  marginTop: 14,
                  backgroundColor: p.highlight ? '#22C55E' : '#334155',
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: loading && isCurrent ? 0.7 : 1,
                }}
              >
                {loading && isCurrent ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : null}
                <Text
                  style={{ color: '#fff', fontWeight: '800' }}
                >
                  {isCurrent
                    ? t('pricing.currentPlanCta')
                    : p.cta}
                </Text>
              </TouchableOpacity>
            </Card>
          );
        })}

        <Card style={{ padding: 16, gap: 10 }}>
          <TouchableOpacity onPress={() => setCompareOpen(true)}>
            <Text
              style={{
                color: c.text,
                textAlign: 'center',
                fontWeight: '700',
              }}
            >
              {t('pricing.compare.open')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onRestore} disabled={loading}>
            <Text
              style={{
                color: c.subtext,
                textAlign: 'center',
              }}
            >
              {t('pricing.restore')}
            </Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>

      {/* Modal compare giữ nguyên như bạn, bỏ qua để câu trả lời đỡ dài */}
      {/* ... */}
    </View>
  );
}
