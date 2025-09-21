// src/app/screens/ReportsMonthly.tsx
import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {useThemeColors} from '../theme';
import Card from '../components/Card';
import Button from '../components/Button';
import {useTranslation} from 'react-i18next';
import {useCurrency} from '../../utils/currency';
import {query} from '../../db';
import {BarChart} from 'react-native-gifted-charts';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportsMonthly'>;

type AptRow = {id: string; name: string};

const MONTH_LABELS = ['1','2','3','4','5','6','7','8','9','10','11','12'];

function ym(y: number, m: number) {
  return `${y}-${String(m).padStart(2, '0')}`;
}

function startEndOfYM(y: number, m: number) {
  const s = new Date(y, m - 1, 1);
  const e = new Date(y, m, 0);
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  return {start: toISO(s), end: toISO(e)};
}

export default function ReportsMonthly({navigation}: Props) {
  const c = useThemeColors();
  const {t} = useTranslation();
  const {format} = useCurrency();

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [monthsToShow, setMonthsToShow] = useState<6 | 12>(12);
  const monthsRange = useMemo(
    () => Array.from({length: monthsToShow}, (_, i) => i + 1),
    [monthsToShow],
  );

  // Tổng hợp cho toàn bộ căn hộ theo từng tháng
  const monthly = useMemo(() => {
    const out: Array<{m: number; revenue: number; expense: number}> = [];
    for (const m of monthsRange) {
      const {start, end} = startEndOfYM(year, m);

      const rev =
        query<{sum: number}>(
          `
        SELECT SUM(i.total) AS sum
        FROM invoices i
        JOIN leases l ON l.id = i.lease_id
        JOIN rooms r ON r.id = l.room_id
        WHERE i.issue_date >= ? AND i.issue_date <= ?
      `,
          [start, end],
        )[0]?.sum ?? 0;

      const exp =
        query<{sum: number}>(
          `
        SELECT SUM(amount) AS sum
        FROM operating_expenses
        WHERE ym = substr(?,1,7)
      `,
          [start],
        )[0]?.sum ?? 0;

      out.push({m, revenue: Number(rev) || 0, expense: Number(exp) || 0});
    }
    return out;
  }, [year, monthsRange]);

  // Dữ liệu cho BarChart (stack)
  const barData = useMemo(
    () =>
      monthly.map((row, idx) => ({
        label: MONTH_LABELS[row.m - 1],
        value: 0, // stack dùng giá trị ở stackData
        onPress: () => setSelectedYM(ym(year, row.m)),
        frontColor: 'transparent', // để không vẽ lớp chính
      })),
    [monthly, year],
  );

  const stackData = useMemo(
    () =>
      monthly.map(row => ({
        stacks: [{value: row.revenue}, {value: row.expense}],
      })),
    [monthly],
  );

  // Khi bấm vào cột → hiển thị chi tiết theo căn hộ
  const [selectedYM, setSelectedYM] = useState<string | null>(null);

  const detail = useMemo(() => {
    if (!selectedYM) return null;
    const aparts = query<AptRow>(
      `SELECT id, name FROM apartments ORDER BY name ASC`,
      [],
    );
    const rows = aparts.map(a => {
      const rev =
        query<{sum: number}>(
          `
        SELECT SUM(i.total) AS sum
        FROM invoices i
        JOIN leases l ON l.id = i.lease_id
        JOIN rooms r ON r.id = l.room_id
        WHERE r.apartment_id = ?
          AND substr(i.issue_date,1,7) = ?
      `,
          [a.id, selectedYM],
        )[0]?.sum ?? 0;

      const exp =
        query<{sum: number}>(
          `
        SELECT SUM(amount) AS sum
        FROM operating_expenses
        WHERE apartment_id = ?
          AND ym = ?
      `,
          [a.id, selectedYM],
        )[0]?.sum ?? 0;

      const revenue = Number(rev) || 0;
      const expense = Number(exp) || 0;
      return {apartment: a.name, revenue, expense, net: revenue - expense};
    });

    const totals = rows.reduce(
      (s, r) => {
        s.revenue += r.revenue;
        s.expense += r.expense;
        s.net += r.net;
        return s;
      },
      {revenue: 0, expense: 0, net: 0},
    );

    return {rows, totals};
  }, [selectedYM]);

  const totalRevenue = monthly.reduce((s, it) => s + it.revenue, 0);
  const totalExpense = monthly.reduce((s, it) => s + it.expense, 0);
  const totalNet = totalRevenue - totalExpense;

  return (
    <View style={{flex: 1, backgroundColor: 'transparent'}}>
      <ScrollView contentContainerStyle={{padding: 12, gap: 12}}>
        {/* Header & filter */}
        <Card>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            <Text style={{color: c.text, fontWeight: '800', fontSize: 16}}>
              {t('reports.monthlyProfit') || 'Monthly profit'}
            </Text>
            <View style={{flexDirection: 'row', gap: 8}}>
              <TouchableOpacity
                onPress={() => setYear(y => y - 1)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: c.card,
                }}>
                <Text style={{color: c.text}}>−</Text>
              </TouchableOpacity>
              <Text style={{color: c.text, fontWeight: '700'}}>{year}</Text>
              <TouchableOpacity
                onPress={() => setYear(y => y + 1)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: c.card,
                }}>
                <Text style={{color: c.text}}>＋</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{flexDirection: 'row', marginTop: 10, gap: 8}}>
            {([6, 12] as const).map(n => (
              <TouchableOpacity
                key={n}
                onPress={() => setMonthsToShow(n)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: monthsToShow === n ? '#22c55e' : c.card,
                }}>
                <Text style={{color: monthsToShow === n ? '#0b1220' : c.text}}>
                  {n} {t('common.months') || 'months'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Biểu đồ stacked (Doanh thu/Chi phí) */}
        <Card>
          <Text style={{color: c.subtext, marginBottom: 8}}>
            {t('reports.tapBarForDetail') || 'Tap a bar to see apartment details'}
          </Text>

          <View style={{width: '100%', alignItems: 'center'}}>
            <BarChart
              data={barData}
              stackData={stackData}
              stackColors={['#22c55e', '#f97316']} // revenue / expense
              barWidth={22}
              noOfSections={4}
              hideRules
              width={Math.max(360, monthsToShow * 28)}
              initialSpacing={20}
              spacing={20}
              barBorderRadius={6}
              yAxisTextStyle={{color: c.subtext}}
              xAxisLabelTextStyle={{color: c.subtext}}
            />
          </View>

          {/* Legend */}
          <View
            style={{
              flexDirection: 'row',
              gap: 16,
              justifyContent: 'center',
              marginTop: 8,
            }}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
              <View
                style={{width: 10, height: 10, backgroundColor: '#22c55e'}}
              />
              <Text style={{color: c.subtext}}>
                {t('reports.revenue') || 'Revenue'}
              </Text>
            </View>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
              <View
                style={{width: 10, height: 10, backgroundColor: '#f97316'}}
              />
              <Text style={{color: c.subtext}}>
                {t('reports.expense') || 'Expense'}
              </Text>
            </View>
          </View>

          {/* Tổng kết năm */}
          <View
            style={{
              marginTop: 12,
              borderTopWidth: 1,
              borderTopColor: '#00000010',
              paddingTop: 10,
              gap: 4,
            }}>
            <Text style={{color: c.text}}>
              {t('reports.totalRevenue') || 'Total revenue'}:{' '}
              <Text style={{fontWeight: '700'}}>{format(totalRevenue)}</Text>
            </Text>
            <Text style={{color: c.text}}>
              {t('reports.totalExpense') || 'Total expense'}:{' '}
              <Text style={{fontWeight: '700'}}>{format(totalExpense)}</Text>
            </Text>
            <Text style={{color: c.text}}>
              {t('reports.net') || 'Net'}:{' '}
              <Text
                style={{
                  fontWeight: '800',
                  color: totalNet >= 0 ? '#16a34a' : '#ef4444',
                }}>
                {format(totalNet)}
              </Text>
            </Text>
          </View>
        </Card>

        {/* Chi tiết theo căn hộ cho tháng đã chọn */}
        {selectedYM && detail && (
          <Card style={{gap: 10}}>
            <View
              style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <Text style={{color: c.text, fontWeight: '800'}}>
                {t('reports.detailFor') || 'Detail for'} {selectedYM}
              </Text>
              <Button
                title={t('common.close') || 'Close'}
                variant="ghost"
                onPress={() => setSelectedYM(null)}
              />
            </View>

            {detail.rows.length === 0 ? (
              <Text style={{color: c.subtext}}>
                {t('reports.noData') || 'No data'}
              </Text>
            ) : (
              <>
                {detail.rows.map((r, i) => (
                  <View
                    key={i}
                    style={{
                      borderRadius: 10,
                      padding: 10,
                      backgroundColor: c.card,
                      gap: 2,
                    }}>
                    <Text style={{color: c.text, fontWeight: '700'}}>
                      {r.apartment}
                    </Text>
                    <Text style={{color: c.subtext}}>
                      {t('reports.revenue') || 'Revenue'}:{' '}
                      <Text style={{color: c.text}}>{format(r.revenue)}</Text>
                    </Text>
                    <Text style={{color: c.subtext}}>
                      {t('reports.expense') || 'Expense'}:{' '}
                      <Text style={{color: c.text}}>{format(r.expense)}</Text>
                    </Text>
                    <Text style={{color: c.subtext}}>
                      {t('reports.net') || 'Net'}:{' '}
                      <Text
                        style={{
                          color: r.net >= 0 ? '#16a34a' : '#ef4444',
                          fontWeight: '700',
                        }}>
                        {format(r.net)}
                      </Text>
                    </Text>
                  </View>
                ))}

                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: '#00000010',
                    paddingTop: 8,
                    gap: 2,
                  }}>
                  <Text style={{color: c.text, fontWeight: '800'}}>
                    {t('reports.total') || 'Total'}
                  </Text>
                  <Text style={{color: c.subtext}}>
                    {t('reports.revenue') || 'Revenue'}:{' '}
                    <Text style={{color: c.text}}>
                      {format(detail.totals.revenue)}
                    </Text>
                  </Text>
                  <Text style={{color: c.subtext}}>
                    {t('reports.expense') || 'Expense'}:{' '}
                    <Text style={{color: c.text}}>
                      {format(detail.totals.expense)}
                    </Text>
                  </Text>
                  <Text style={{color: c.subtext}}>
                    {t('reports.net') || 'Net'}:{' '}
                    <Text
                      style={{
                        color:
                          detail.totals.net >= 0 ? '#16a34a' : '#ef4444',
                        fontWeight: '800',
                      }}>
                      {format(detail.totals.net)}
                    </Text>
                  </Text>
                </View>
              </>
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
