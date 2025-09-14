import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import { useThemeColors } from '../theme';
import { listLeasesByRoom } from '../../services/rent';

type Props = NativeStackScreenProps<RootStackParamList, 'LeaseHistory'>;

export default function LeaseHistory({ route, navigation }: Props) {
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
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        {leases.length === 0 ? (
          <Card><Text style={{ color: c.subtext }}>Chưa có hợp đồng nào.</Text></Card>
        ) : (
          leases.map(l => (
            <TouchableOpacity key={l.id} onPress={() => navigation.navigate('LeaseHistoryDetail', { leaseId: l.id })}>
              <Card>
                <Text style={{ color: c.text, fontWeight: '700' }}>
                  {l.start_date} → {l.end_date || '—'}
                </Text>
                <Text style={{ color: c.subtext }}>
                  Trạng thái: <Text style={{ color: c.text }}>{l.status}</Text> • Chu kỳ: {l.billing_cycle}
                </Text>
              </Card>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}
