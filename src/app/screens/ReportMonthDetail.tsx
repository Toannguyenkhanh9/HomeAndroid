import React, { useMemo } from 'react';
import { View, Text, FlatList } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Card from '../components/Card';
import { useThemeColors } from '../theme';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '../../utils/currency';
import { revenueAndExpenseByApartmentForMonth } from '../../services/rent';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportMonthDetail'>;

export default function ReportMonthDetail({ route }: Props) {
  // ✅ fallback khi route.params bị undefined (VD: mở screen trực tiếp)
  const now = new Date();
  const fallback = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const { year, month } = (route?.params ?? fallback);

  const c = useThemeColors();
  const { t } = useTranslation();
  const { format } = useCurrency();

  const { rows, totals } = useMemo(
    () => revenueAndExpenseByApartmentForMonth(year, month),
    [year, month],
  );

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent', padding: 12, gap: 12 }}>
      <Card>
        <Text style={{ color: c.text, fontWeight: '800' }}>
          {t('reports.breakdownFor')} {month}/{year}
        </Text>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
          <Text style={{ flex: 2, color: c.subtext }}>{t('reports.apartment')}</Text>
          <Text style={{ flex: 1, color: c.subtext, textAlign: 'right' }}>{t('reports.revenue')}</Text>
          <Text style={{ flex: 1, color: c.subtext, textAlign: 'right' }}>{t('reports.expense')}</Text>
          <Text style={{ flex: 1, color: c.subtext, textAlign: 'right' }}>{t('reports.profit')}</Text>
        </View>

        <FlatList
          data={rows}
          keyExtractor={(it) => it.apartment_id}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ flex: 2, color: c.text }}>{item.name}</Text>
              <Text style={{ flex: 1, color: c.text, textAlign: 'right' }}>{format(item.revenue)}</Text>
              <Text style={{ flex: 1, color: c.text, textAlign: 'right' }}>{format(item.expense)}</Text>
              <Text style={{ flex: 1, color: item.profit >= 0 ? c.text : '#ef4444', textAlign: 'right' }}>
                {format(item.profit)}
              </Text>
            </View>
          )}
          ListFooterComponent={
            <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: c.card, paddingTop: 8 }}>
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ flex: 2, color: c.text, fontWeight: '700' }}>{t('reports.total')}</Text>
                <Text style={{ flex: 1, color: c.text, textAlign: 'right', fontWeight: '700' }}>{format(totals.revenue)}</Text>
                <Text style={{ flex: 1, color: c.text, textAlign: 'right', fontWeight: '700' }}>{format(totals.expense)}</Text>
                <Text style={{ flex: 1, color: totals.profit >= 0 ? c.text : '#ef4444', textAlign: 'right', fontWeight: '700' }}>
                  {format(totals.profit)}
                </Text>
              </View>
            </View>
          }
        />
      </Card>
    </View>
  );
}
