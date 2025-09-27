// src/app/screens/RoomForm.tsx
import React from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView
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
import {useTranslation} from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();

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
    if (!apartmentId) return Alert.alert(t('roomForm.missingApartmentId'));
    const list = query<Row>(
      `SELECT id, code, status, floor, area FROM rooms WHERE apartment_id = ? ORDER BY code ASC`,
      [apartmentId],
    );
    setRooms(list);
    loadAptInfo();
  }, [apartmentId, loadAptInfo, t]);

  useFocusEffect(React.useCallback(() => { reload(); }, [reload]));

  const filtered = React.useMemo(() => {
    const ttxt = q.trim().toLowerCase();
    if (!ttxt) return rooms;
    return rooms.filter(
      r => r.code.toLowerCase().includes(ttxt) || r.status.toLowerCase().includes(ttxt),
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
      <ScrollView contentContainerStyle={{ padding: 12,paddingBottom: insets.bottom + 100,  gap: 12  }}
       contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled>
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        scrollEnabled={false}
        numColumns={2}
        columnWrapperStyle={{justifyContent: 'space-between', marginBottom: 12}}
        contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 96, paddingTop: 12}}
        ListHeaderComponent={
          <View style={{width: '100%', marginBottom: 12}}>
            <View style={{gap: 12}}>
              {/* Thông tin căn hộ + nút điều hướng */}
              {apt ? (
                <Card>
                  <Text style={{color: c.text, fontWeight: '800'}}>{apt.name}</Text>
                  <Text style={{color: c.subtext}}>{apt.address || '—'}</Text>
                  <Text style={{color: c.text, marginTop: 6}}>
                    {t('roomForm.total')}: {apt.total} • {t('roomForm.occupied')}: {apt.occupied} • {t('roomForm.available')}: {apt.available}
                  </Text>

                  <View style={{flexDirection: 'row', gap: 10, marginTop: 10}}>
                    <Button
                      title={t('roomForm.operatingCosts')}
                      onPress={() => navigation.navigate('OperatingCosts', {apartmentId})}
                    />
                    <Button
                      title={t('roomForm.report')}
                      variant="ghost"
                      onPress={() => navigation.navigate('ApartmentReport', {apartmentId})}
                    />
                  </View>
                </Card>
              ) : null}

              {/* Thanh tìm kiếm */}
              <TextInput
                placeholder={t('roomForm.searchPlaceholder')}
                placeholderTextColor={c.subtext}
                value={q}
                onChangeText={setQ}
                style={{
                  backgroundColor: c.card,
                  color: c.text,
                  padding: 10,
                  borderRadius: 10,
                }}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <View>
            <Card>
              <Text style={{color: c.subtext}}>
                {t('roomForm.noRooms')}
              </Text>
            </Card>
          </View>
        }
        renderItem={({item}) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('RoomDetail', {roomId: item.id})}
            onLongPress={() => {
              Alert.alert(t('roomForm.deleteRoom'), t('roomForm.confirmDelete', {code: item.code}), [
                {text: t('common.cancel')},
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: () => {
                    try {
                      deleteRoom(item.id);
                      reload();
                    } catch (e: any) {
                      Alert.alert(t('roomForm.deleteFailed'), e?.message || t('common.tryAgain'));
                    }
                  },
                },
              ]);
            }}
            style={{
              width: '48%',
              backgroundColor: c.card,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 18,
              borderWidth: 1,
              borderColor: c.border,
              shadowColor: '#000',
              shadowOpacity: 0.06,
              shadowRadius: 6,
              shadowOffset: {width: 0, height: 2},
              elevation: 2,
            }}>
            <Text style={{fontSize: 48, marginBottom: 6}}>🚪</Text>
            <Text style={{color: c.text, fontWeight: '700', fontSize: 16}}>
              {item.code}{item.floor ? ` – T${item.floor}` : ''}
            </Text>
            <Text style={[statusStyle(item.status), {marginTop: 4}]}>
              {item.status ===  'occupied' ? t('roomForm.occupied') : t('roomForm.available')}
            </Text>
            {item.area ? (
              <Text style={{color: c.subtext, fontSize: 13, marginTop: 4}}>
                {item.area} m²
              </Text>
            ) : null}
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
        <Text style={{color: '#0B1220', fontWeight: '700'}}>+ {t('roomForm.room')}</Text>
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
      </ScrollView>
  );
}
