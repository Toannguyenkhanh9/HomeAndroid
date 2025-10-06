import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { query } from '../../db';
import { useThemeColors, cardStyle } from '../theme';
import { useCurrency } from '../../utils/currency';
import Card from '../components/Card';
import { useTranslation } from 'react-i18next';
import { formatDateISO } from '../../utils/date';
import { useSettings } from '../state/SettingsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'HoldingDepositList'>;

export default function HoldingDepositList({ route }: Props) {
  const { dateFormat, language } = useSettings();
  const { apartmentId } = route.params;
  const c = useThemeColors();
  const { format } = useCurrency();
  const [rows, setRows] = useState<any[]>([]);
  const { t } = useTranslation();

  useEffect(() => {
    const list = query<any>(
      `
      SELECT l.id, l.deposit_amount, l.start_date, l.end_date, l.status,
             r.code AS room_code,
             t.full_name AS tenant_name, t.phone AS tenant_phone
      FROM leases l
      JOIN rooms r   ON r.id = l.room_id
      LEFT JOIN tenants t ON t.id = l.tenant_id
      WHERE r.apartment_id = ?
        AND l.status = 'active'
        AND l.deposit_amount IS NOT NULL
        AND l.deposit_amount > 0
      ORDER BY l.start_date DESC
      `,
      [apartmentId],
    );
    setRows(list);
  }, [apartmentId]);

  // 🧮 Tổng tiền đặt cọc
  const totalDeposit = useMemo(
    () =>
      rows.reduce(
        (sum, r) => sum + (Number(r?.deposit_amount) || 0),
        0,
      ),
    [rows],
  );

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent', padding: 16, gap: 12 }}>
      {/* Tổng các khoản đặt cọc */}
      <Card style={{ padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: c.text, fontWeight: '800' }}>
          {t('cycleDetail.total') || 'Tổng đặt cọc'}
        </Text>
        <Text style={{ color: c.text, fontWeight: '800' }}>{format(totalDeposit)}</Text>
      </Card>

      <FlatList
        data={rows}
        contentContainerStyle={{ gap: 12, paddingVertical: 8 }}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={[cardStyle(c), { padding: 12 }]}>
            <Text style={{ color: c.text, fontWeight: '800' }}>
              {item.room_code || '—'} · {item.tenant_name || '—'}
            </Text>
            <Text style={{ color: c.subtext }}>
              {item.tenant_phone || '—'}
            </Text>
            <Text style={{ color: c.text, marginTop: 6 }}>
              {t('holdingDeposits.amount')}: <Text style={{ fontWeight: '800' }}>{format(Number(item.deposit_amount) || 0)}</Text>
            </Text>
            <Text style={{ color: c.subtext }}>
              {t('holdingDeposits.start')}: {formatDateISO(item.start_date, dateFormat, language)}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Card>
            <Text style={{ color: c.subtext }}>{t('holdingDeposits.none')}</Text>
          </Card>
        }
      />
    </View>
  );
}
