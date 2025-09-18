// src/app/screens/LeaseHistoryDetail.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import { useThemeColors } from '../theme';
import { useCurrency } from '../../utils/currency';
import { getLease, listCycles, getLeaseSettlement } from '../../services/rent';
import { useSettings } from '../state/SettingsContext';
import { formatDateISO } from '../../utils/date';
import { useTranslation } from 'react-i18next';

type Props = NativeStackScreenProps<RootStackParamList, 'LeaseHistoryDetail'>;

export default function LeaseHistoryDetail({ route, navigation }: Props) {
  const { dateFormat, language } = useSettings();
  const { t } = useTranslation();
  const { leaseId } = route.params;
  const c = useThemeColors();
  const { format } = useCurrency();

  const [lease, setLease] = useState<any>();
  const [cycles, setCycles] = useState<any[]>([]);
  const [settle, setSettle] = useState<any | null>(null);

  useEffect(() => {
    try {
      setLease(getLease(leaseId));
      setCycles(listCycles(leaseId) || []);
      setSettle(getLeaseSettlement(leaseId) || null);
    } catch {}
  }, [leaseId]);

  const adjustments: Array<{ name: string; amount: number }> = useMemo(() => {
    if (!settle) return [];
    if (Array.isArray((settle as any).adjustments)) {
      return (settle as any).adjustments.map((x: any) => ({
        name: String(x?.name || ''),
        amount: Number(x?.amount || 0),
      }));
    }
    try {
      const raw = settle.details_json ? JSON.parse(settle.details_json) : [];
      if (Array.isArray(raw)) {
        return raw.map((x: any) => ({
          name: String(x?.name || ''),
          amount: Number(x?.amount || 0),
        }));
      }
    } catch {}
    return [];
  }, [settle]);

  const adjustmentsTotal = useMemo(() => {
    const dbTotal = Number(settle?.adjustments_total ?? NaN);
    if (!Number.isNaN(dbTotal)) return dbTotal;
    return adjustments.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  }, [settle, adjustments]);

  const endProjected = useMemo(() => {
    if (!lease) return '—';
    if (lease.end_date) return lease.end_date;
    try {
      const s = new Date(lease.start_date);
      if (lease.billing_cycle === 'monthly') {
        const e = new Date(s);
        e.setMonth(e.getMonth() + 1);
        e.setDate(e.getDate() - 1);
        return e.toISOString().slice(0, 10);
      }
      if (lease.billing_cycle === 'daily') {
        const e = new Date(s);
        e.setDate(e.getDate() + Math.max(1, Number(lease.duration_days || 1)) - 1);
        return e.toISOString().slice(0, 10);
      }
      const e = new Date(s);
      e.setFullYear(e.getFullYear() + 1);
      e.setDate(e.getDate() - 1);
      return e.toISOString().slice(0, 10);
    } catch {
      return '—';
    }
  }, [lease]);

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Card>
          <Text style={{ color: c.text }}>{t('leaseHistoryDetail.start')}: {formatDateISO(lease?.start_date, dateFormat, language) || '—'}</Text>
          <Text style={{ color: c.text }}>{t('leaseHistoryDetail.end')}: {lease?.end_date ? formatDateISO(lease?.end_date, dateFormat, language) : '—'}</Text>
          <Text style={{ color: c.text }}>{t('leaseHistoryDetail.endProjected')}: {formatDateISO(endProjected, dateFormat, language)}</Text>
          <Text style={{ color: c.text }}>{t('leaseHistoryDetail.status')}: {lease?.status === 'active' ? t('common.active') : t('common.ended')}</Text>
          <Text style={{ color: c.text }}>{t('leaseHistoryDetail.billing')}: {lease?.billing_cycle === 'daily' ? t('common.daily') : t('common.monthly')}</Text>
          <Text style={{ color: c.text }}>{t('leaseHistoryDetail.baseRent')}: {format(lease?.base_rent || 0)}</Text>
          <Text style={{ color: c.text }}>{t('leaseHistoryDetail.deposit')}: {format(lease?.deposit_amount || 0)}</Text>
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={{ color: c.text, fontWeight: '800' }}>{t('leaseHistoryDetail.cycles')}</Text>
          {cycles.length === 0 ? (
            <Text style={{ color: c.subtext }}>—</Text>
          ) : (
            cycles.map(cy => (
              <TouchableOpacity
                key={cy.id}
                onPress={() => navigation.navigate('CycleDetail', { cycleId: cy.id })}
              >
                <View style={{ borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>
                    {formatDateISO(cy.period_start, dateFormat, language)} → {formatDateISO(cy.period_end, dateFormat, language)}
                  </Text>
                  <Text style={{ color: c.subtext }}>
                    {t('leaseHistoryDetail.status')}: <Text style={{ color: c.text }}>{cy.status === 'settled' ? t('settledYes') : t('settledNo')}</Text>
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={{ color: c.text, fontWeight: '800' }}>{t('leaseHistoryDetail.settlement')}</Text>
          {settle ? (
            <>
              <Text style={{ color: c.text }}>
                {t('leaseHistoryDetail.settledAt')}: {settle.settled_at ? formatDateISO(settle.settled_at, dateFormat, language) : '—'}
              </Text>
              <Text style={{ color: c.text }}>{t('leaseHistoryDetail.deposit')}: {format(Number(settle.deposit || 0))}</Text>

              <View style={{ marginTop: 6, gap: 6 }}>
                <Text style={{ color: c.text, fontWeight: '700' }}>{t('leaseHistoryDetail.adjustments')}</Text>
                {adjustments.length > 0 ? (
                  adjustments.map((it, idx) => (
                    <View key={`${it.name}-${idx}`} style={{ borderRadius: 10, padding: 8 }}>
                      <Text style={{ color: c.text, fontWeight: '600' }}>
                        {it.name || t('leaseHistoryDetail.fee')}
                      </Text>
                      <Text style={{ color: c.subtext }}>
                        {t('leaseHistoryDetail.amount')}: <Text style={{ color: c.text }}>{format(Number(it.amount) || 0)}</Text>
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: c.subtext }}>{t('leaseHistoryDetail.noAdjustments')}</Text>
                )}
              </View>

              <Text style={{ color: c.text, marginTop: 6 }}>
                {t('leaseHistoryDetail.totalAdjustments')}: {format(adjustmentsTotal)}
              </Text>

              {Number(settle.final_balance) > 0 && (
                <Text style={{ color: c.text }}>
                  {t('leaseHistoryDetail.refund')}: {format(Number(settle.final_balance))}
                </Text>
              )}
              {Number(settle.final_balance) < 0 && (
                <Text style={{ color: c.text }}>
                  {t('leaseHistoryDetail.collectMore')}: {format(Math.abs(Number(settle.final_balance)))}
                </Text>
              )}
              {Number(settle.final_balance) === 0 && (
                <Text style={{ color: c.text }}>{t('leaseHistoryDetail.noBalance')}</Text>
              )}
            </>
          ) : (
            <Text style={{ color: c.subtext }}>— {t('leaseHistoryDetail.noSettlement')}</Text>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}
