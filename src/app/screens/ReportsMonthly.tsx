// src/app/screens/ReportsMonthly.tsx
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Card from '../components/Card';
import Button from '../components/Button';
import { useThemeColors } from '../theme';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '../../utils/currency';

// Tổng hợp Thu/Chi/LN (đã loại cọc) – cùng nguồn với màn chi tiết
import { revenueAndExpenseByApartmentForMonth } from '../../services/rent';

// 👇 Optional (debug) – không bắt buộc có export
let __rentDebug: any;
try {
  __rentDebug = require('../../services/rent');
} catch {}
const debugMonthRevenueRows: undefined | ((y: number, m: number) => any[]) =
  __rentDebug?.debugMonthRevenueRows;
const markContractDepositItems: undefined | (() => void) =
  __rentDebug?.markContractDepositItems;

type Props = NativeStackScreenProps<RootStackParamList, 'ReportsMonthly'>;

const MONTHS = ['1','2','3','4','5','6','7','8','9','10','11','12'];

export default function ReportsMonthly({ navigation }: Props) {
  const c = useThemeColors();
  const { t } = useTranslation();
  const { format } = useCurrency();

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(thisYear);

  // ===== Debug panel state =====
  const [showDbg, setShowDbg] = useState(false);
  const [dbgMonth, setDbgMonth] = useState<number | null>(null);
  const [dbgRows, setDbgRows] = useState<any[]>([]);

  const openDbgFor = (m: number) => {
    try { markContractDepositItems?.(); } catch {}
    const rows = debugMonthRevenueRows ? debugMonthRevenueRows(year, m) : [];
    setDbgRows(rows);
    setDbgMonth(m);
    setShowDbg(true);
  };

  // Lấy Thu/Chi/Lợi nhuận theo tháng (đồng bộ với màn chi tiết)
  const { revenue, expense, profit, maxAbs } = useMemo(() => {
    const rev: number[] = [];
    const exp: number[] = [];
    const pro: number[] = [];
    for (let m = 1; m <= 12; m++) {
      const { totals } = revenueAndExpenseByApartmentForMonth(year, m);
      rev.push(Number(totals.revenue || 0));
      exp.push(Number(totals.expense || 0));
      pro.push(Number(totals.profit || 0));
    }
    const maxA = Math.max(1, ...pro.map(v => Math.abs(v)));
    return { revenue: rev, expense: exp, profit: pro, maxAbs: maxA };
  }, [year]);

  // Khu vực vẽ biểu đồ lợi nhuận 2 chiều
  const CHART_H = 280;
  const PADDING_TOP = 12;
  const PADDING_BOTTOM = 28;
  const PLOT_H = CHART_H - PADDING_TOP - PADDING_BOTTOM;
  const ZERO_Y = PADDING_TOP + PLOT_H / 2;

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setYear(y => y - 1)} style={{ padding: 8 }}>
            <Text style={{ color: c.text }}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={{ color: c.text, fontWeight: '800' }}>
            {t('reports.monthly')} • {year}
          </Text>
          <TouchableOpacity onPress={() => setYear(y => y + 1)} style={{ padding: 8 }}>
            <Text style={{ color: c.text }}>{'›'}</Text>
          </TouchableOpacity>
        </Card>

        <Card>
          <Text style={{ color: c.subtext }}>{t('reports.tapMonthToSeeBreakdown')}</Text>
        </Card>

        {/* BIỂU ĐỒ LỢI NHUẬN */}
        <Card>
          <View style={{ flexDirection: 'row', gap: 14, marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#22C55E' }} />
              <Text style={{ color: c.subtext }}>{t('reports.profit') || 'Profit'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#EF4444' }} />
              <Text style={{ color: c.subtext }}>{t('reports.loss') || 'Loss'}</Text>
            </View>
          </View>

          <View style={{ height: CHART_H, position: 'relative' }}>
            {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
              <View
                key={i}
                style={{
                  position: 'absolute', left: 0, right: 0,
                  top: PADDING_TOP + p * PLOT_H, height: 1,
                  backgroundColor: '#2a2f3a', opacity: 0.18
                }}
              />
            ))}
            <View
              style={{
                position: 'absolute', left: 0, right: 0, top: ZERO_Y,
                height: 2, backgroundColor: '#94a3b8', opacity: 0.6
              }}
            />

            <View
              style={{
                position: 'absolute',
                left: 8, right: 8, top: PADDING_TOP, bottom: PADDING_BOTTOM,
                flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'
              }}
            >
              {MONTHS.map((_, i) => {
                const p = profit[i] || 0;
                const HALF = PLOT_H / 2;
                const h = Math.max(2, Math.round((Math.abs(p) / maxAbs) * (HALF - 10)));
                const color = p >= 0 ? '#22C55E' : '#EF4444';
                return (
                  <View key={i} style={{ alignItems: 'center', width: 30 }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => (navigation as any).navigate('ReportMonthDetail', { year, month: i + 1 })}
                      style={{ width: 22, height: PLOT_H, justifyContent: p >= 0 ? 'flex-end' : 'flex-start' }}
                    >
                      <View style={{ height: HALF }} />
                      <View
                        style={{
                          width: 22, height: h, backgroundColor: color,
                          borderTopLeftRadius: p >= 0 ? 6 : 0, borderTopRightRadius: p >= 0 ? 6 : 0,
                          borderBottomLeftRadius: p < 0 ? 6 : 0, borderBottomRightRadius: p < 0 ? 6 : 0,
                          alignSelf: 'center', transform: [{ translateY: p >= 0 ? -2 : 2 }]
                        }}
                      />
                    </TouchableOpacity>
                    <View style={{ minHeight: 16, marginTop: 6, alignItems: 'center' }}>
                      <Text numberOfLines={1} style={{ fontSize: 11, color: c.subtext, fontVariant: ['tabular-nums'] }}>
                        {format(p)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: c.subtext, marginTop: 2 }}>{MONTHS[i]}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </Card>

        {/* SUMMARY: Thu / Chi / Lợi nhuận */}
        <Card>
          <Text style={{ color: c.text, fontWeight: '700', marginBottom: 6 }}>{t('reports.summary')}</Text>
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#ddd', flexWrap: 'wrap' }}>
            {MONTHS.map((m, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.9}
                onPress={() => (navigation as any).navigate('ReportMonthDetail', { year, month: i + 1 })}
                onLongPress={() => openDbgFor(i + 1)} // 🧪 giữ lâu để debug
                style={{
                  width: '50%',
                  borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#ddd',
                  padding: 10, gap: 4
                }}
              >
                <Text style={{ color: c.subtext, fontSize: 12 }}>{t('month')} {m}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: c.subtext }}>{t('reports.revenue')}</Text>
                  <Text style={{ color: c.text, fontWeight: '600' }}>{format(revenue[i] || 0)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: c.subtext }}>{t('reports.expense')}</Text>
                  <Text style={{ color: c.text, fontWeight: '600' }}>{format(expense[i] || 0)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: c.subtext }}>{t('reports.profit') || 'Profit'}</Text>
                  <Text style={{ color: (profit[i] || 0) >= 0 ? '#22C55E' : '#EF4444', fontWeight: '700' }}>
                    {format(profit[i] || 0)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      </ScrollView>

      {/* 🧪 DEBUG MODAL */}
      <Modal visible={showDbg} animationType="slide" onRequestClose={() => setShowDbg(false)}>
        <View style={{ flex: 1, backgroundColor: 'white' }}>
          <View style={{ padding: 12, gap: 6 }}>
            <Text style={{ fontWeight: '800', fontSize: 16 }}>
              🧪 Dòng tính doanh thu {dbgMonth ? `• Tháng ${dbgMonth}/${year}` : ''}
            </Text>
            <Text style={{ color: '#6b7280' }}>
              Các dòng có <Text style={{ fontWeight: '700' }}>excludedBecauseDeposit = true</Text> đã bị loại khỏi doanh thu.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                title="Đánh dấu lại các dòng đặt cọc"
                variant="ghost"
                onPress={() => {
                  try { markContractDepositItems?.(); } catch {}
                  if (dbgMonth) openDbgFor(dbgMonth);
                }}
              />
              <Button title="Đóng" onPress={() => setShowDbg(false)} />
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
            {dbgRows.map((r, idx) => (
              <View key={idx} style={{ marginBottom: 12, padding: 10, borderRadius: 8, backgroundColor: '#f8fafc' }}>
                <Text style={{ fontWeight: '700' }}>{String(r.description || '—')}</Text>
                <Text>Số tiền: {format(Number(r.amount) || 0)}</Text>
                <Text>Kỳ: {r.period_start} → {r.period_end}</Text>
                {'overlapDays' in r ? <Text>overlapDays: {r.overlapDays}</Text> : null}
                <Text>Bị loại vì cọc: {String(r.excludedBecauseDeposit)}</Text>
                {r.reason ? <Text>Lý do: {r.reason}</Text> : null}
              </View>
            ))}
            {dbgRows.length === 0 && (
              <Text style={{ padding: 12, color: '#6b7280' }}>
                Không có dòng nào rơi vào tháng này (hoặc bạn chưa thêm hàm debugMonthRevenueRows trong rent.ts).
              </Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
