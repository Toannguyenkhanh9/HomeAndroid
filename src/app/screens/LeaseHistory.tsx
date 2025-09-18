// src/app/screens/LeaseHistory.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import { useThemeColors } from '../theme';
import { listLeasesByRoom } from '../../services/rent';
import { useSettings } from '../state/SettingsContext';
import { formatDateISO } from '../../utils/date';
import { useTranslation } from 'react-i18next';

type Props = NativeStackScreenProps<RootStackParamList, 'LeaseHistory'>;

export default function LeaseHistory({ route, navigation }: Props) {
  const { dateFormat, language } = useSettings();
  const { t } = useTranslation();
  const { roomId } = route.params;
  const c = useThemeColors();

  const [leases, setLeases] = useState<any[]>([]);

  useEffect(() => {
    try {
      setLeases(listLeasesByRoom(roomId) || []);
    } catch {
      setLeases([]);
    }
  }, [roomId]);

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        {leases.length === 0 ? (
          <Card>
            <Text style={{ color: c.subtext }}>{t('leaseHistory.empty')}</Text>
          </Card>
        ) : (
          leases.map(l => (
            <TouchableOpacity
              key={l.id}
              onPress={() =>
                navigation.navigate('LeaseHistoryDetail', { leaseId: l.id })
              }
            >
              <Card>
                <Text style={{ color: c.text, fontWeight: '700' }}>
                  {formatDateISO(l.start_date, dateFormat, language)} →{' '}
                  {l.end_date
                    ? formatDateISO(l.end_date, dateFormat, language)
                    : '—'}
                </Text>
                <Text style={{ color: c.subtext }}>
                  {t('leaseHistory.status')}:{' '}
                  <Text style={{ color: c.text }}>{l.status}</Text> •{' '}
                  {t('leaseHistory.billing')}: {l.billing_cycle}
                </Text>
              </Card>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}
