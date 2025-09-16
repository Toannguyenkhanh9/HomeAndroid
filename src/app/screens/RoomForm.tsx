// src/app/screens/RoomForm.tsx
import React from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {query} from '../../db';
import {useThemeColors} from '../theme';
import Card from '../components/Card';
import RoomCreateModal from '../components/RoomCreateModal';
import Button from '../components/Button';
import {useFocusEffect} from '@react-navigation/native';
import {deleteRoom} from '../../services/rent';

type Row = { id: string; code: string; status: string; floor?: number; area?: number };

type AptInfo = {
  id: string;
  name: string;
  address?: string | null;
  total: number;
  occupied: number;
  available: number;
};

export default function RoomForm({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'RoomForm'>) {
  const {apartmentId} = route.params;
  const c = useThemeColors();

  const [rooms, setRooms] = React.useState<Row[]>([]);
  const [q, setQ] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);
  const [apt, setApt] = React.useState<AptInfo | null>(null);

  const loadAptInfo = React.useCallback(() => {
    const aptRow =
      query<{id: string; name: string; address: string | null}>(
        `SELECT id, name, address FROM apartments WHERE id = ? LIMIT 1`,
        [apartmentId],
      )[0] || null;

    if (!aptRow) {
      setApt(null);
      return;
    }
    const total =
      query<{c: number}>(`SELECT COUNT(*) c FROM rooms WHERE apartment_id = ?`, [apartmentId])[0]?.c ?? 0;
    const occupied =
      query<{c: number}>(`SELECT COUNT(*) c FROM rooms WHERE apartment_id = ? AND status = 'occupied'`, [apartmentId])[0]?.c ?? 0;
    const available = total - occupied;

    setApt({
      id: aptRow.id,
      name: aptRow.name,
      address: aptRow.address,
      total,
      occupied,
      available,
    });
  }, [apartmentId]);

  const reload = React.useCallback(() => {
    if (!apartmentId) return Alert.alert('Thiếu apartmentId');
    const list = query<Row>(
      `SELECT id, code, status, floor, area FROM rooms WHERE apartment_id = ? ORDER BY code ASC`,
      [apartmentId],
    );
    setRooms(list);
    loadAptInfo();
  }, [apartmentId, loadAptInfo]);

  useFocusEffect(React.useCallback(() => { reload(); }, [reload]));

  const filtered = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rooms;
    return rooms.filter(
      r => r.code.toLowerCase().includes(t) || r.status.toLowerCase().includes(t),
    );
  }, [rooms, q]);

  // màu theo trạng thái
  const statusStyle = (status: string) => {
    const st = status.toLowerCase();
    const color =
      st === 'available' ? '#22C55E'
      : st === 'occupied' ? '#F59E0B'
      : st === 'maintenance' ? '#60A5FA'
      : c.subtext;
    return { color, fontStyle: 'italic' as const, fontWeight: '600' as const };
  };

  return (
    <View style={{flex: 1, backgroundColor: 'transparent'}}>
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 96, paddingTop: 12, gap: 12}}
        ListHeaderComponent={
          <View style={{gap: 12}}>
            {/* Thông tin căn hộ + nút điều hướng */}
            {apt ? (
              <Card>
                <Text style={{color: c.text, fontWeight: '800'}}>{apt.name}</Text>
                <Text style={{color: c.subtext}}>{apt.address || '—'}</Text>
                <Text style={{color: c.text, marginTop: 6}}>
                  Tổng phòng: {apt.total} • Đang thuê: {apt.occupied} • Trống: {apt.available}
                </Text>

                <View style={{flexDirection: 'row', gap: 10, marginTop: 10}}>
                  <Button
                    title="Chi phí hoạt động"
                    onPress={() => navigation.navigate('OperatingCosts', {apartmentId})}
                  />
                  <Button
                    title="Báo cáo"
                    variant="ghost"
                    onPress={() => navigation.navigate('ApartmentReport', {apartmentId})}
                  />
                </View>
              </Card>
            ) : null}

            {/* Thanh tìm kiếm */}
            <TextInput
              placeholder="Tìm phòng theo mã/trạng thái..."
              placeholderTextColor={c.subtext}
              value={q}
              onChangeText={setQ}
              style={{
                // borderWidth: 1,
                // borderColor: '#2A2F3A',
                backgroundColor: c.card,
                color: c.text,
                padding: 10,
                borderRadius: 10,
              }}
            />
          </View>
        }
        ListEmptyComponent={
          <View>
            <Card>
              <Text style={{color: c.subtext}}>
                Chưa có phòng nào. Nhấn nút + để thêm.
              </Text>
            </Card>
          </View>
        }
        renderItem={({item}) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('RoomDetail', {roomId: item.id})}
            onLongPress={() => {
              Alert.alert('Xoá phòng', `Xoá phòng ${item.code}?`, [
                {text: 'Huỷ'},
                {
                  text: 'Xoá',
                  style: 'destructive',
                  onPress: () => {
                    try {
                      deleteRoom(item.id);
                      reload();
                    } catch (e: any) {
                      Alert.alert('Không thể xoá', e?.message || 'Vui lòng thử lại');
                    }
                  },
                },
              ]);
            }}>
            <View
              style={{
                padding: 12,
                // borderWidth: 1,
                // borderColor: '#2A2F3A',
                backgroundColor: c.card,
                borderRadius: 12,
                marginBottom: 10,
              }}>
              {/* Hàng tiêu đề: icon • “Mã – Tầng” • trạng thái (bên phải, in nghiêng, tô màu) */}
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Text style={{fontSize: 22, marginRight: 10}}>🛏️</Text>
                <Text style={{color: c.text, fontWeight: '700', flex: 1}}>
                  {item.code}{item.floor ? ` – Tầng ${item.floor}` : ''}
                </Text>
                <Text style={statusStyle(item.status)}>{item.status}</Text>
              </View>

              {/* Thông tin phụ (diện tích nếu có) */}
              {item.area ? (
                <Text style={{color: c.subtext, marginTop: 6}}>
                  Diện tích: {item.area} m²
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
      />

      {/* FAB thêm phòng */}
      <TouchableOpacity
        activeOpacity={0.8}
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
        }}>
        <Text style={{color: '#0B1220', fontWeight: '700'}}>+ Phòng</Text>
      </TouchableOpacity>

      {/* Modal tạo phòng */}
      <RoomCreateModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        apartmentId={apartmentId}
        onCreated={() => {
          setShowCreate(false);
          reload();
        }}
      />
    </View>
  );
}
