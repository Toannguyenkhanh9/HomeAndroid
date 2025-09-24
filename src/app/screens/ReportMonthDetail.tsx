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
  // Fallback nếu vào screen trực tiếp
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

  const HeaderCell = ({ children, flex = 1, align = 'left' as 'left'|'right' }) => (
    <Text
      style={{
        flex,
        color: c.text,
        fontWeight: '700',
        textAlign: align,
        fontVariant: ['tabular-nums'],
      }}
      numberOfLines={1}
    >
      {children}
    </Text>
  );

  const Num = ({ value, align = 'right' as 'left'|'right', bold = false, color }: any) => (
    <Text
      style={{
        flex: 1,
        textAlign: align,
        color: color ?? c.text,
        fontWeight: bold ? '700' : '400',
        fontVariant: ['tabular-nums'],
      }}
      numberOfLines={1}
    >
      {format(value)}
    </Text>
  );

  const ProfitBadge = ({ value }: { value: number }) => {
    const positive = value >= 0;
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'flex-end',
        }}
      >
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: positive ? '#e8f7ee' : '#fdecec',
          }}
        >
          <Text
            style={{
              color: positive ? '#15803d' : '#dc2626',
              fontWeight: '700',
              fontVariant: ['tabular-nums'],
            }}
            numberOfLines={1}
          >
            {format(value)}
          </Text>
        </View>
      </View>
    );
  };

  const renderItem = ({ item, index }: any) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 10,
        backgroundColor: index % 2 === 0 ? c.bg : c.card,
        borderRadius: 8,
      }}
    >
      <Text style={{ flex: 2, color: c.text }} numberOfLines={1}>
        {item.name}
      </Text>
      <Num value={item.revenue} />
      <Num value={item.expense} />
      <ProfitBadge value={item.profit} />
    </View>
  );

  return (
    <View style={{ flex: 1, padding: 12, gap: 12 }}>
      {/* Header chip */}
      <Card style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: c.card,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
          }}
        >
          <Text style={{ color: c.text, fontWeight: '700' }}>
            {t('reports.breakdownFor')} {month}/{year}
          </Text>
        </View>
      </Card>

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {/* Table header */}
        <View
          style={{
            flexDirection: 'row',
            paddingVertical: 10,
            paddingHorizontal: 12,
            backgroundColor: '#e9f6e9',
            borderBottomWidth: 1,
            borderBottomColor: c.card,
            alignItems: 'center',
          }}
        >
          <HeaderCell flex={2}>{t('reports.apartment')}</HeaderCell>
          <HeaderCell align="right">{t('reports.revenue')}</HeaderCell>
          <HeaderCell align="right">{t('reports.expense')}</HeaderCell>
          <HeaderCell align="right">{t('reports.profit')}</HeaderCell>
        </View>

        <FlatList
          data={rows}
          keyExtractor={(it) => it.apartment_id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          contentContainerStyle={{ padding: 12, paddingTop: 10 }}
          ListFooterComponent={
            <View
              style={{
                marginTop: 6,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: c.card,
                paddingHorizontal: 0,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  backgroundColor: '#f5f7f2',
                  borderRadius: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ flex: 2, color: c.text, fontWeight: '800' }}>
                  {t('reports.total')}
                </Text>
                <Num value={totals.revenue} bold />
                <Num value={totals.expense} bold />
                <ProfitBadge value={totals.profit} />
              </View>
            </View>
          }
        />
      </Card>
    </View>
  );
}
