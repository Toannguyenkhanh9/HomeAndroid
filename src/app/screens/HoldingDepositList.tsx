// src/app/screens/HoldingDepositList.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import { useThemeColors } from '../theme';
import { useCurrency } from '../../utils/currency';
import { getLease, listLeases } from '../../services/rent';
import { getTenant, getRoom } from '../../services/rent';
import { formatDateISO } from '../../utils/date';
import { useSettings } from '../state/SettingsContext';
import { useTranslation } from 'react-i18next';

type Props = NativeStackScreenProps<RootStackParamList, 'HoldingDepositList'>;

export default function HoldingDepositList({ navigation }: Props) {
  const c = useThemeColors();
  const { format } = useCurrency();
  const { dateFormat, language } = useSettings();
  const { t } = useTranslation();

  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    try {
      // lấy tất cả leases có deposit_amount > 0 và đang active
      const all = listLeases().filter((l: any) => Number(l.deposit_amount) > 0 && l.status === 'active');
      const enriched = all.map((l: any) => {
        const tenant = l.tenant_id ? getTenant(l.tenant_id) : null;
        const room = l.room_id ? getRoom(l.room_id) : null;
        return {
          ...l,
          tenantName: tenant?.full_name || '',
          tenantPhone: tenant?.phone || '',
          roomCode: room?.code || '',
        };
      });
      setRows(enriched);
    } catch {}
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <Header title={t('holdingDeposits.title')} />
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 12, gap: 12 }}
        ListEmptyComponent={
          <Card>
            <Text style={{ color: c.subtext }}>{t('holdingDeposits.none')}</Text>
          </Card>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => navigation.navigate('LeaseDetail', { leaseId: item.id })}>
            <Card style={{ gap: 6 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>{item.tenantName || t('holdingDeposits.noTenant')}</Text>
              {item.tenantPhone ? <Text style={{ color: c.subtext }}>{item.tenantPhone}</Text> : null}
              <Text style={{ color: c.text }}>
                {t('holdingDeposits.room')}: {item.roomCode || '—'}
              </Text>
              <Text style={{ color: c.text }}>
                {t('holdingDeposits.start')}: {formatDateISO(item.start_date, dateFormat, language)}
              </Text>
              <Text style={{ color: c.text, fontWeight: '600' }}>
                {t('holdingDeposits.amount')}: {format(item.deposit_amount)}
              </Text>
            </Card>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
