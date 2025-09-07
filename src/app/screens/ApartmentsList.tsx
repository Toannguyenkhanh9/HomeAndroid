import React from 'react';
import {View, Text, TextInput, FlatList, TouchableOpacity, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {query} from '../../db';
import {useThemeColors} from '../theme';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import ApartmentCreateModal from '../components/ApartmentCreateModal';
import {useFocusEffect} from '@react-navigation/native';
import {deleteApartment} from '../../services/rent';

type Row = { id: string; name: string; address?: string|null };

export default function ApartmentsList({navigation}: NativeStackScreenProps<RootStackParamList, 'ApartmentsList'>) {
  const c = useThemeColors();

  const [rows, setRows] = React.useState<Row[]>([]);
  const [q, setQ] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);

  const reload = React.useCallback(() => {
    const list = query<Row>(`SELECT id, name, address FROM apartments ORDER BY created_at DESC`);
    setRows(list);
  }, []);

  useFocusEffect(React.useCallback(()=>{ reload(); }, [reload]));

  const filtered = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(t) || (r.address?.toLowerCase().includes(t)));
  }, [rows, q]);

  return (
    <View style={{flex:1, backgroundColor:c.bg}}>
      <Header
        title="Căn hộ"
        right={<TouchableOpacity onPress={()=> navigation.navigate('Settings')}>
          <Text style={{color:c.text, fontSize:18}}>⚙️</Text>
        </TouchableOpacity>}
      />

      <View style={{padding:16}}>
        <TextInput
          placeholder="Tìm kiếm căn hộ..."
          placeholderTextColor={c.subtext}
          value={q}
          onChangeText={setQ}
          style={{borderWidth:1, borderColor:'#2A2F3A', backgroundColor:c.card, color:c.text, padding:10, borderRadius:10}}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i=>i.id}
        contentContainerStyle={{paddingHorizontal:16, paddingBottom:96}}
        ListEmptyComponent={
          <View style={{paddingHorizontal:16}}>
            <Card><Text style={{color:c.subtext}}>Chưa có căn hộ nào. Nhấn nút + để thêm.</Text></Card>
          </View>
        }
        renderItem={({item})=> (
          <TouchableOpacity
            onPress={()=> navigation.navigate('RoomForm', {apartmentId: item.id})}
            onLongPress={()=>{
              Alert.alert('Tuỳ chọn', `Xoá căn hộ "${item.name}"?`, [
                {text:'Huỷ'},
                {text:'Xoá', style:'destructive', onPress: ()=>{
                  try {
                    deleteApartment(item.id);
                    reload();
                  } catch(e:any) {
                    Alert.alert('Không thể xoá', e?.message || 'Vui lòng thử lại');
                  }
                }},
              ]);
            }}
          >
            <View style={{padding:12, borderWidth:1, borderColor:'#2A2F3A', backgroundColor:c.card, borderRadius:12, marginBottom:10}}>
              <Text style={{color:c.text, fontWeight:'700'}}>{item.name}</Text>
              {!!item.address && <Text style={{color:c.subtext, marginTop:2}}>{item.address}</Text>}
            </View>
          </TouchableOpacity>
        )}
      />

      {/* FAB thêm căn hộ */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={()=> setShowCreate(true)}
        style={{
          position:'absolute', right:16, bottom:24,
          backgroundColor:'#22C55E',
          paddingHorizontal:20, paddingVertical:14,
          borderRadius:28, shadowColor:'#000', shadowOpacity:0.2, shadowRadius:6, elevation:6
        }}>
        <Text style={{color:'#0B1220', fontWeight:'700'}}>+ Căn hộ</Text>
      </TouchableOpacity>

      <ApartmentCreateModal
        visible={showCreate}
        onClose={()=> setShowCreate(false)}
        onCreated={reload}
      />
    </View>
  );
}
