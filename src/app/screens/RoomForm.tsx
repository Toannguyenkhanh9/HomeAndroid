import React, {useEffect, useMemo, useState} from 'react';
import {View, TouchableOpacity, FlatList, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {createRoom, deleteRoom} from '../../services/rent';
import {query} from '../../db';
import Input from '../components/Input';
import Button from '../components/Button';
import Card from '../components/Card';
import Header from '../components/Header';
import ListItem from '../components/ListItem';
import EmptyState from '../components/EmptyState';
import {useThemeColors} from '../theme';

export default function RoomForm({route, navigation}: NativeStackScreenProps<RootStackParamList, 'RoomForm'>) {
  const {apartmentId} = route.params;
  const [code, setCode] = useState('');
  const [floor, setFloor] = useState('');
  const [area, setArea] = useState('');
  const [q, setQ] = useState('');
  const [rooms, setRooms] = useState<Array<{id:string; code:string; status:string}>>([]);
  const c = useThemeColors();

  const reload = () => setRooms(query(`SELECT id, code, status FROM rooms WHERE apartment_id = ? ORDER BY code ASC`, [apartmentId]));
  useEffect(reload, []);

  const filtered = useMemo(()=> {
    const key = q.trim().toLowerCase();
    if (!key) return rooms;
    return rooms.filter(r => r.code.toLowerCase().includes(key) || r.status.toLowerCase().includes(key));
  }, [rooms, q]);

  function confirmDeleteRoom(id: string, code: string) {
    Alert.alert('Xoá phòng', `Bạn có chắc muốn xoá phòng ${code}?`, [
      {text: 'Huỷ'},
      {text: 'Xoá', style: 'destructive', onPress: () => {
        try { deleteRoom(id); reload(); }
        catch(e:any){ Alert.alert('Không thể xoá', e?.message || 'Có lỗi xảy ra'); }
      }}
    ]);
  }

  return (
    <View style={{flex:1, padding:16, backgroundColor: c.bg}}>
      <Header title="Phòng & Hợp đồng" />
      <Card>
        <Input placeholder="Mã phòng (VD: P201)" value={code} onChangeText={setCode}/>
        <View style={{height:8}}/>
        <Input placeholder="Tầng" value={floor} onChangeText={setFloor} keyboardType="numeric"/>
        <View style={{height:8}}/>
        <Input placeholder="Diện tích (m2)" value={area} onChangeText={setArea} keyboardType="numeric"/>
        <Button title="Lưu phòng" onPress={() => {
          if (!code.trim()) return;
          createRoom(apartmentId, code.trim(), Number(floor)||undefined, Number(area)||undefined);
          setCode(''); setFloor(''); setArea(''); reload();
        }} />
      </Card>

      <Card>
        <Input placeholder="Tìm phòng theo mã/trạng thái..." value={q} onChangeText={setQ} />
      </Card>

      <FlatList
        data={filtered}
        keyExtractor={i=>i.id}
        renderItem={({item}) => (
          <TouchableOpacity onPress={() => navigation.navigate('LeaseForm', {roomId: item.id})}>
            <ListItem
              title={`${item.code} — ${item.status}`}
              right={<Button title="Xoá" variant="danger" onPress={()=>confirmDeleteRoom(item.id, item.code)} />}
              onLongPress={()=>confirmDeleteRoom(item.id, item.code)}
            />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<EmptyState title={q ? 'Không tìm thấy phòng' : 'Chưa có phòng'} />}
      />
    </View>
  );
}