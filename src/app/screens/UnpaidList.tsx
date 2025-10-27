// src/app/screens/UnpaidList.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useThemeColors } from '../theme';
import Card from '../components/Card';
import { useCurrency } from '../../utils/currency';
import { useTranslation } from 'react-i18next';
import { formatDateISO } from '../../utils/date';
import { listUnpaidBalances } from '../../services/rent';
import { useSettings } from '../state/SettingsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'UnpaidList'>;

export default function UnpaidList({ route, navigation }: Props) {
  const { apartmentId } = route.params || {};
  const c = useThemeColors();
  const { t } = useTranslation();
  const { format } = useCurrency();
  const { dateFormat, language } = useSettings();

  const [rows, setRows] = useState<Array<ReturnType<typeof listUnpaidBalances>[number]>>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    try {
      const r = listUnpaidBalances(apartmentId);
      setRows(r);
    } catch (e) {
      // no-op
    }
  }, [apartmentId]);

  useEffect(load, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(it) => it.invoice_id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setRefreshing(false); }} />
        }
        contentContainerStyle={{ padding: 12, gap: 12 }}
        ListEmptyComponent={
          <Text style={{ color: c.subtext, textAlign: 'center', marginTop: 24 }}>
            {t('overview.noUnpaid') || 'Không có khoản còn nợ.'}
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('CycleDetail', { cycleId: item.cycle_id })}
          >
            <Card style={{ paddingVertical: 12, paddingHorizontal: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: c.text, fontWeight: '700' }}>
                  {t('common.room') || 'Phòng'}: {item.room_code}
                </Text>
                <Text style={{ color: c.subtext }}>
                  {formatDateISO(item.period_start, dateFormat, language)} – {formatDateISO(item.period_end, dateFormat, language)}
                </Text>
              </View>
              {!!item.tenant_name && (
                <Text style={{ color: c.text, marginBottom: 6 }}>
                  {t('cycleDetail.tenant') || 'Người thuê'}: {item.tenant_name}
                </Text>
              )}
              <View style={{ gap: 2 }}>
                <Text style={{ color: c.text }}>
                  {t('invoice.total') || 'Tổng tiền'}: {format(item.total)}
                </Text>
                <Text style={{ color: c.text }}>
                  {t('invoice.paidTotal') || 'Đã thu'}: {format(item.paid)}
                </Text>
                <Text style={{ color: c.text, fontWeight: '700' }}>
                  {t('invoice.balance') || 'Còn lại'}: {format(item.balance)}
                </Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
