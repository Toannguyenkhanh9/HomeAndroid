// src/app/screens/ApartmentReport.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform, Modal } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import { useThemeColors } from '../theme';
import { useCurrency } from '../../utils/currency';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getOperatingMonth, getReportRevenueByRoom } from '../../services/rent';
import { onlyDigits } from '../../utils/number';
import { useSettings } from '../state/SettingsContext';
import { formatDateISO } from '../../utils/date';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = NativeStackScreenProps<RootStackParamList, 'ApartmentReport'>;

// ✅ Local (không UTC) để không bị lùi 1 ngày
const toYMDLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const firstDay = (y: number, m0: number) => new Date(y, m0, 1);
const lastDay  = (y: number, m0: number) => new Date(y, m0 + 1, 0);

function prevMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m0 = (now.getMonth() + 11) % 12;
  return { from: firstDay(y, m0), to: lastDay(y, m0) };
}

function monthsInRange(from: Date, to: Date): string[] {
  const a = new Date(from.getFullYear(), from.getMonth(), 1);
  const b = new Date(to.getFullYear(), to.getMonth(), 1);
  const out: string[] = [];
  while (a <= b) {
    out.push(ymOf(a));
    a.setMonth(a.getMonth() + 1);
  }
  return out;
}

export default function ApartmentReport({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { dateFormat, language } = useSettings();
  const { apartmentId } = route.params as any;
  const c = useThemeColors();
  const { format } = useCurrency();
  const { t } = useTranslation();

  const def = useMemo(prevMonthRange, []);
  const [fromDate, setFromDate] = useState<Date>(def.from);
  const [toDate, setToDate] = useState<Date>(def.to);

  // iOS modal pickers
  const [showFrom, setShowFrom] = useState(false);
  const [showTo, setShowTo] = useState(false);
  const [tempFrom, setTempFrom] = useState<Date | null>(null);
  const [tempTo, setTempTo] = useState<Date | null>(null);

  const openFrom = () => {
    if (Platform.OS === 'ios') {
      setTempFrom(fromDate);
      setShowFrom(true);
    } else {
      setShowFrom(true);
    }
  };
  const openTo = () => {
    if (Platform.OS === 'ios') {
      setTempTo(toDate);
      setShowTo(true);
    } else {
      setShowTo(true);
    }
  };

  // đảm bảo from <= to
  const applyFrom = (d: Date) => {
    const nf = d;
    const nt = toDate < nf ? nf : toDate;
    setFromDate(nf);
    setToDate(nt);
  };
  const applyTo = (d: Date) => {
    const nt = d;
    const nf = fromDate > nt ? nt : fromDate;
    setFromDate(nf);
    setToDate(nt);
  };

  // ✅ Doanh thu theo kỳ (không theo issue_date)
  const incomeByRoom = useMemo(() => {
    const start = toYMDLocal(fromDate);
    const end   = toYMDLocal(toDate);
    return getReportRevenueByRoom(apartmentId, start, end);
  }, [apartmentId, fromDate, toDate]);

  // Chi vận hành (tổng theo các tháng giao nhau)
  const operatingCost = useMemo(() => {
    const yms = monthsInRange(fromDate, toDate);
    let total = 0;
    const detail: Array<{ ym: string; name: string; amount: number }> = [];

    for (const ym of yms) {
      const { items } = getOperatingMonth(apartmentId, ym);
      for (const it of items || []) {
        const amt = Number(onlyDigits(String(it.amount ?? 0))) || 0;
        total += amt;
        detail.push({ ym, name: it.name, amount: amt });
      }
    }
    return { total, detail };
  }, [apartmentId, fromDate, toDate]);

  const finalBalance = useMemo(
    () => incomeByRoom.total - operatingCost.total,
    [incomeByRoom.total, operatingCost.total]
  );

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 100, gap: 12 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Text style={{ color: c.text, fontWeight: '800', marginBottom: 8 }}>
            {t('apartmentReport.range')}
          </Text>

          <TouchableOpacity
            onPress={openFrom}
            activeOpacity={0.7}
            style={{ borderRadius: 10, padding: 10, backgroundColor: c.card, marginBottom: 8 }}
          >
            <Text style={{ color: c.text }}>
              {formatDateISO(toYMDLocal(fromDate), dateFormat, language)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={openTo}
            activeOpacity={0.7}
            style={{ borderRadius: 10, padding: 10, backgroundColor: c.card }}
          >
            <Text style={{ color: c.text }}>
              {formatDateISO(toYMDLocal(toDate), dateFormat, language)}
            </Text>
          </TouchableOpacity>

          {/* iOS pickers */}
          {Platform.OS === 'ios' && (
            <>
              <Modal
                visible={showFrom}
                transparent
                animationType="slide"
                onRequestClose={() => setShowFrom(false)}
              >
                <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' }}>
                  <View style={{ backgroundColor: (c as any).bg || c.card, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12 }}>
                      <TouchableOpacity onPress={() => setShowFrom(false)}>
                        <Text style={{ color: c.subtext }}>{t('common.cancel') || 'Cancel'}</Text>
                      </TouchableOpacity>
                      <Text style={{ color: c.text, fontWeight: '700' }}>{t('apartmentReport.from') || 'From'}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          if (tempFrom) applyFrom(tempFrom);
                          setShowFrom(false);
                        }}
                      >
                        <Text style={{ color: (c as any).primary || '#10b981', fontWeight: '700' }}>
                          {t('common.done') || 'Done'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={tempFrom ?? fromDate}
                      mode="date"
                      display="spinner"
                      maximumDate={toDate}
                      onChange={(_, d) => d && setTempFrom(d)}
                    />
                  </View>
                </View>
              </Modal>

              <Modal
                visible={showTo}
                transparent
                animationType="slide"
                onRequestClose={() => setShowTo(false)}
              >
                <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' }}>
                  <View style={{ backgroundColor: (c as any).bg || c.card, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12 }}>
                      <TouchableOpacity onPress={() => setShowTo(false)}>
                        <Text style={{ color: c.subtext }}>{t('common.cancel') || 'Cancel'}</Text>
                      </TouchableOpacity>
                      <Text style={{ color: c.text, fontWeight: '700' }}>{t('apartmentReport.to') || 'To'}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          if (tempTo) applyTo(tempTo);
                          setShowTo(false);
                        }}
                      >
                        <Text style={{ color: (c as any).primary || '#10b981', fontWeight: '700' }}>
                          {t('common.done') || 'Done'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={tempTo ?? toDate}
                      mode="date"
                      display="spinner"
                      minimumDate={fromDate}
                      onChange={(_, d) => d && setTempTo(d)}
                    />
                  </View>
                </View>
              </Modal>
            </>
          )}

          {/* Android pickers */}
          {Platform.OS !== 'ios' && showFrom && (
            <DateTimePicker
              value={fromDate}
              mode="date"
              display="default"
              maximumDate={toDate}
              onChange={(e, d) => {
                setShowFrom(false);
                if (e.type === 'set' && d) applyFrom(d);
              }}
            />
          )}
          {Platform.OS !== 'ios' && showTo && (
            <DateTimePicker
              value={toDate}
              mode="date"
              display="default"
              minimumDate={fromDate}
              onChange={(e, d) => {
                setShowTo(false);
                if (e.type === 'set' && d) applyTo(d);
              }}
            />
          )}

          <View style={{ alignItems: 'flex-end', marginTop: 10 }}>
            <Button title={t('apartmentReport.viewReport')} onPress={() => {}} />
          </View>
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={{ color: c.text, fontWeight: '800' }}>{t('apartmentReport.incomeByRoom')}</Text>
          {incomeByRoom.rows.length === 0 ? (
            <Text style={{ color: c.subtext }}>—</Text>
          ) : (
            incomeByRoom.rows.map((r: any, i: number) => (
              <View key={i} style={{ borderRadius: 10, padding: 10 }}>
                <Text style={{ color: c.text, fontWeight: '700' }}>
                  {t('apartmentReport.room')} {r.code}
                </Text>
                <Text style={{ color: c.subtext }}>
                  {t('apartmentReport.totalIncome')}: <Text style={{ color: c.text }}>{format(Number(r.total) || 0)}</Text>
                </Text>
              </View>
            ))
          )}
          <Text style={{ color: c.text, marginTop: 6 }}>
            {t('apartmentReport.totalIncome')}: {format(incomeByRoom.total)}
          </Text>
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={{ color: c.text, fontWeight: '800' }}>{t('apartmentReport.expenses')}</Text>
          {operatingCost.detail.length === 0 ? (
            <Text style={{ color: c.subtext }}>—</Text>
          ) : (
            operatingCost.detail.map((d, idx) => (
              <View key={idx} style={{ borderRadius: 10, padding: 10 }}>
                <Text style={{ color: c.text, fontWeight: '700' }}>
                  {d.ym} — {d.name}
                </Text>
                <Text style={{ color: c.subtext }}>
                  {t('apartmentReport.amount')}: <Text style={{ color: c.text }}>{format(d.amount)}</Text>
                </Text>
              </View>
            ))
          )}
          <Text style={{ color: c.text, marginTop: 6 }}>
            {t('apartmentReport.totalExpense')}: {format(operatingCost.total)}
          </Text>
        </Card>

        <Card>
          <Text style={{ color: c.text, fontWeight: '700' }}>
            {t('apartmentReport.finalBalance')}: {format(finalBalance)}
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}
