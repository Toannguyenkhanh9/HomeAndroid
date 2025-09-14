// src/app/screens/ApartmentsList.tsx
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, Dimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { query } from '../../db';
import { useThemeColors } from '../theme';
import Card from '../components/Card';
import ApartmentCreateModal from '../components/ApartmentCreateModal';
import { useFocusEffect } from '@react-navigation/native';
import { deleteApartment } from '../../services/rent';

type Row = { id: string; name: string; address?: string | null; room_count: number };

export default function ApartmentsList({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ApartmentsList'>) {
  const c = useThemeColors();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [showCreate, setShowCreate] = React.useState(false);

  const reload = React.useCallback(() => {
    const list = query<Row>(
      `
      SELECT a.id, a.name, a.address,
             (SELECT COUNT(*) FROM rooms r WHERE r.apartment_id = a.id) AS room_count
      FROM apartments a
      ORDER BY a.created_at DESC
    `,
    );
    setRows(list);
  }, []);

  useFocusEffect(React.useCallback(() => { reload(); }, [reload]));

  const size = Math.floor((Dimensions.get('window').width - 16 * 3) / 2); // 2 cột

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Nền đơn giản */}
      <View style={{ position: 'absolute', inset: 0 }}>
        <View
          style={{
            position: 'absolute',
            width: 260,
            height: 260,
            borderRadius: 130,
            backgroundColor: '#1d2736',
            opacity: 0.35,
            top: -60,
            left: -40,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: 320,
            height: 320,
            borderRadius: 160,
            backgroundColor: '#1a2331',
            opacity: 0.25,
            bottom: -80,
            right: -60,
          }}
        />
      </View>

      {/* Danh sách căn hộ */}
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        numColumns={2}
        columnWrapperStyle={{ paddingHorizontal: 16, gap: 16 }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 96, gap: 16 }}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 16 }}>
            <Card>
              <Text style={{ color: c.subtext }}>Chưa có căn hộ nào. Nhấn nút + để thêm.</Text>
            </Card>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('RoomForm', { apartmentId: item.id })}
            onLongPress={() => {
              Alert.alert('Tuỳ chọn', `Xoá căn hộ "${item.name}"?`, [
                { text: 'Huỷ' },
                {
                  text: 'Xoá',
                  style: 'destructive',
                  onPress: () => {
                    try {
                      deleteApartment(item.id);
                      reload();
                    } catch (e: any) {
                      Alert.alert('Không thể xoá', e?.message || 'Vui lòng thử lại');
                    }
                  },
                },
              ]);
            }}
            activeOpacity={0.85}
            style={{
              width: size,
              height: size,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#2A2F3A',
              backgroundColor: c.card,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 10,
            }}
          >
            {/* Icon lớn */}
            <Text style={{ fontSize: 42, marginBottom: 8 }}>🏢</Text>

            {/* Tên căn hộ */}
            <Text
              style={{ color: c.text, fontWeight: '700', textAlign: 'center' }}
              numberOfLines={2}
            >
              {item.name}
            </Text>

            {/* Số phòng */}
            <Text style={{ color: c.subtext, marginTop: 4 }}>{item.room_count} phòng</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        onPress={() => navigation.navigate('Settings')}
        style={{
          position: 'absolute',
          left: 16,
          bottom: 24,
          backgroundColor: c.card,
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 4,
        }}
      >
        <Text style={{ fontSize: 22, color: c.text }}>⚙️</Text>
      </TouchableOpacity>

      {/* FAB thêm căn hộ */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setShowCreate(true)}
        style={{
          position: 'absolute',
          right: 16,
          bottom: 24,
          backgroundColor: '#22C55E',
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderRadius: 28,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 6,
          elevation: 6,
        }}
      >
        <Text style={{ color: '#0B1220', fontWeight: '700' }}>+ Căn hộ</Text>
      </TouchableOpacity>

      <ApartmentCreateModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={reload}
      />
    </View>
  );
}
