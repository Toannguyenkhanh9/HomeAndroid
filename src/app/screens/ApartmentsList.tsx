import React, {useMemo, useState, useCallback} from 'react';
import {View, FlatList, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {RootStackParamList} from '../navigation/RootNavigator';
import {query} from '../../db';
import Button from '../components/Button';
import Card from '../components/Card';
import Header from '../components/Header';
import ListItem from '../components/ListItem';
import EmptyState from '../components/EmptyState';
import Input from '../components/Input';
import {useThemeColors} from '../theme';
import {deleteApartment} from '../../services/rent';

export default function ApartmentsList({navigation}: NativeStackScreenProps<RootStackParamList, 'ApartmentsList'>) {
  const [rows, setRows] = useState<Array<{id:string; name:string; address?:string}>>([]);
  const [q, setQ] = useState('');
  const c = useThemeColors();

  const reload = useCallback(() => setRows(query(`SELECT id, name, address FROM apartments ORDER BY created_at DESC`)), []);
  useFocusEffect(useCallback(()=>{ reload(); }, [reload]));

  const filtered = useMemo(()=> {
    const key = q.trim().toLowerCase();
    if (!key) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(key) || (r.address||'').toLowerCase().includes(key));
  }, [rows, q]);

  function confirmDeleteApartment(id: string, name: string) {
    Alert.alert('Xoá căn hộ', `Bạn có chắc muốn xoá "${name}"?`, [
      {text: 'Huỷ'},
      {text: 'Xoá', style: 'destructive', onPress: () => {
        try { deleteApartment(id); reload(); }
        catch(e:any){ Alert.alert('Không thể xoá', e?.message || 'Có lỗi xảy ra'); }
      }}
    ]);
  }

  return (
    <View style={{flex:1, padding:16, backgroundColor: c.bg}}>
      <Header title="Căn hộ" right={<Button title="Cài đặt" variant="ghost" onPress={()=>navigation.navigate('Settings')} />} />
      <Card>
        <Input placeholder="Tìm kiếm căn hộ..." value={q} onChangeText={setQ} />
        <Button title="Thêm căn hộ" onPress={() => navigation.navigate('ApartmentForm')} />
        <Button title="Báo cáo" variant="ghost" onPress={() => navigation.navigate('Reports')} />
      </Card>
      <FlatList
        data={filtered}
        keyExtractor={i=>i.id}
        renderItem={({item}) => (
          <ListItem
            title={item.name}
            subtitle={item.address}
            onPress={()=>navigation.navigate('RoomForm', {apartmentId: item.id})}
            right={<Button title="Xoá" variant="danger" onPress={()=>confirmDeleteApartment(item.id, item.name)} />}
            onLongPress={()=>confirmDeleteApartment(item.id, item.name)}
          />
        )}
        ListEmptyComponent={<EmptyState title={q ? 'Không tìm thấy kết quả' : 'Chưa có căn hộ'} hint={q ? 'Thử từ khoá khác' : "Nhấn 'Thêm căn hộ' để tạo mới"} />}
      />
    </View>
  );
}