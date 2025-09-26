// src/screens/PricingPlans.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import Card from '../components/Card';
import { useThemeColors } from '../theme';

type PlanId = 'free' | 'starter' | 'pro' | 'enterprise';

export default function PricingPlans() {
  const { t } = useTranslation();
  const c = useThemeColors();
  const [yearly, setYearly] = useState(true);
  const [compareOpen, setCompareOpen] = useState(false);

  const fmt = (n: number) => (n === 0 ? t('pricing.freeTag') : n.toLocaleString('vi-VN') + t('pricing.currencySuffix'));
  const priceLabel = (id: PlanId, m: number, y: number) => {
    if (id === 'enterprise') return t('pricing.contact');
    return yearly ? `${fmt(y)} ${t('pricing.perYear')}` : `${fmt(m)} ${t('pricing.perMonth')}`;
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
    [t, yearly]
  );

  const onSelectPlan = (id: PlanId) => {
    // TODO: implement thanh toán/IAP/đi đến màn hình liên hệ...
    console.log('select plan', id, yearly ? 'yearly' : 'monthly');
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Card style={{ padding: 16 }}>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 18 }}>{t('pricing.title')}</Text>
          <Text style={{ color: c.subtext, marginTop: 6 }}>{t('pricing.subtitle')}</Text>

          {/* Toggle */}
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
              <Text style={{ color: yearly ? c.text : '#fff', fontWeight: '700' }}>{t('pricing.payMonthly')}</Text>
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
              <Text style={{ color: yearly ? '#fff' : c.text, fontWeight: '700' }}>{t('pricing.payYearly')}</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {plans.map((p) => (
          <Card key={p.id} style={{ borderWidth: p.highlight ? 2 : 1, borderColor: p.highlight ? '#22C55E' : c.card, padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 20, marginRight: 8 }}>{p.icon}</Text>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: 18 }}>{p.name}</Text>
                {p.highlight ? (
                  <View style={{ marginLeft: 8, backgroundColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
                    <Text style={{ color: '#065f46', fontWeight: '700' }}>{t('pricing.mostPopular')}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>{priceLabel(p.id, p.monthly, p.yearly)}</Text>
            </View>

            <View style={{ gap: 6, marginTop: 8 }}>
              {p.features.map((f, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: '#22C55E', marginRight: 6 }}>•</Text>
                  <Text style={{ color: c.text }}>{f}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => onSelectPlan(p.id)}
              style={{
                marginTop: 14,
                backgroundColor: p.highlight ? '#22C55E' : '#334155',
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>{p.cta}</Text>
            </TouchableOpacity>

            {p.id === 'pro' ? (
              <TouchableOpacity
                onPress={() => onSelectPlan('pro')}
                style={{
                  marginTop: 10,
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#22C55E',
                }}
              >
                <Text style={{ color: '#22C55E', fontWeight: '700' }}>{t('pricing.trial')}</Text>
              </TouchableOpacity>
            ) : null}
          </Card>
        ))}

        <Card style={{ padding: 16, gap: 10 }}>
          <TouchableOpacity onPress={() => setCompareOpen(true)}>
            <Text style={{ color: c.text, textAlign: 'center', fontWeight: '700' }}>{t('pricing.compare.open')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => console.log('restore')}>
            <Text style={{ color: c.subtext, textAlign: 'center' }}>{t('pricing.restore')}</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>

      <Modal visible={compareOpen} transparent animationType="fade" onRequestClose={() => setCompareOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: c.card, borderRadius: 16, padding: 16 }}>
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>{t('pricing.compare.title')}</Text>
            <View style={{ height: 12 }} />
            <ScrollView horizontal>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: 200, paddingRight: 8 }}>
                  {[
                    t('pricing.compare.rows.apartments'),
                    t('pricing.compare.rows.rooms'),
                    t('pricing.compare.rows.export'),
                    t('pricing.compare.rows.watermark'),
                    t('pricing.compare.rows.reminders'),
                    t('pricing.compare.rows.removeAds'),
                    t('pricing.compare.rows.emailNotif'),
                    t('pricing.compare.rows.advancedStats'),
                    t('pricing.compare.rows.unlimited'),
                    t('pricing.compare.rows.multibranch'),
                    t('pricing.compare.rows.onlinePayments'),
                    t('pricing.compare.rows.dedicatedSupport'),
                  ].map((row, i) => (
                    <View key={i} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#334155' }}>
                      <Text style={{ color: c.subtext }}>{row}</Text>
                    </View>
                  ))}
                </View>

                {[ 'free', 'starter', 'pro', 'enterprise' ].map((colId) => (
                  <View key={colId} style={{ width: 140 }}>
                    {[
                      colId === 'free' ? '1' : colId === 'starter' ? '3' : colId === 'pro' ? '10' : t('pricing.compare.values.unlimited'),
                      colId === 'free' ? '5' : colId === 'starter' ? '30' : colId === 'pro' ? '100' : t('pricing.compare.values.unlimited'),
                      colId === 'free' ? t('pricing.compare.values.no') : t('pricing.compare.values.yes'),
                      colId === 'pro' || colId === 'enterprise' ? t('pricing.compare.values.no') : t('pricing.compare.values.yes'),
                      colId === 'free' ? t('pricing.compare.values.no') : t('pricing.compare.values.yes'),
                      colId === 'free' ? t('pricing.compare.values.no') : t('pricing.compare.values.yes'),
                      colId === 'pro' || colId === 'enterprise' ? t('pricing.compare.values.yes') : t('pricing.compare.values.no'),
                      colId === 'pro' || colId === 'enterprise' ? t('pricing.compare.values.yes') : t('pricing.compare.values.no'),
                      colId === 'enterprise' ? t('pricing.compare.values.yes') : t('pricing.compare.values.no'),
                      colId === 'enterprise' ? t('pricing.compare.values.yes') : t('pricing.compare.values.no'),
                      colId === 'enterprise' ? t('pricing.compare.values.yes') : t('pricing.compare.values.no'),
                      colId === 'enterprise' ? t('pricing.compare.values.yes') : t('pricing.compare.values.no'),
                    ].map((val, i) => (
                      <View key={i} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#334155', alignItems: 'center' }}>
                        <Text style={{ color: c.text }}>{val}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={{ height: 12 }} />
            <TouchableOpacity
              onPress={() => setCompareOpen(false)}
              style={{ alignSelf: 'center', backgroundColor: '#22C55E', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>{t('pricing.compare.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
