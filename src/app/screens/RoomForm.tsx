import React from 'react';
import {View, Text, TextInput, FlatList, TouchableOpacity, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {query} from '../../db';
import {useThemeColors} from '../theme';
import Header from '../components/Header';
import Card from '../components/Card';
import RoomCreateModal from '../components/RoomCreateModal';
import {useFocusEffect} from '@react-navigation/native';
import {deleteRoom} from '../../services/rent';

type Row = { id: string; code: string; status: string; floor?: number; area?: number };

export default function RoomForm({route, navigation}: NativeStackScreenProps<RootStackParamList, 'RoomForm'>) {
  const {apartmentId} = route.params;
  const c = useThemeColors();

  const [rooms, setRooms] = React.useState<Row[]>([]);
  const [q, setQ] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);

  const reload = React.useCallback(() => {
    if (!apartmentId) return Alert.alert('Thiếu apartmentId');
    const list = query<Row>(
      `SELECT id, code, status, floor, area FROM rooms WHERE apartment_id = ? ORDER BY code ASC`,
      [apartmentId],
    );
    setRooms(list);
  }, [apartmentId]);

  useFocusEffect(React.useCallback(() => { reload(); }, [reload]));

  const filtered = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rooms;
    return rooms.filter(
      r => r.code.toLowerCase().includes(t) || r.status.toLowerCase().includes(t),
    );
  }, [rooms, q]);

  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <Header title="Phòng" />

      {/* Thanh tìm kiếm */}
      <View style={{padding: 16}}>
        <TextInput
          placeholder="Tìm phòng theo mã/trạng thái..."
          placeholderTextColor={c.subtext}
          value={q}
          onChangeText={setQ}
          style={{
            borderWidth: 1,
            borderColor: '#2A2F3A',
            backgroundColor: c.card,
            color: c.text,
            padding: 10,
            borderRadius: 10,
          }}
        />
      </View>

      {/* Danh sách phòng */}
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 96}}
        ListEmptyComponent={
          <View style={{paddingHorizontal: 16}}>
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
                      Alert.alert(
                        'Không thể xoá',
                        e?.message || 'Vui lòng thử lại',
                      );
                    }
                  },
                },
              ]);
            }}>
            <View
              style={{
                padding: 12,
                borderWidth: 1,
                borderColor: '#2A2F3A',
                backgroundColor: c.card,
                borderRadius: 12,
                marginBottom: 10,
              }}>
              <Text style={{color: c.text, fontWeight: '700'}}>{item.code}</Text>
              <Text style={{color: c.subtext, marginTop: 2}}>
                {item.status}
                {item.floor ? ` • Tầng ${item.floor}` : ''}
                {item.area ? ` • ${item.area} m2` : ''}
              </Text>
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
