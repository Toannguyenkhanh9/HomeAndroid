import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, Alert, FlatList} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {getRoom, getLeaseByRoom, listCycles, nextDueDate, endLeaseEarly, hasUnpaidCycles} from '../../services/rent';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';

export default function RoomDetail({route, navigation}: NativeStackScreenProps<RootStackParamList, 'RoomDetail'>) {
  const {roomId} = route.params;
  const c = useThemeColors();
  const [room, setRoom] = useState<any>();
  const [lease, setLease] = useState<any>();
  const [cycles, setCycles] = useState<any[]>([]);
  const [due, setDue] = useState<string|undefined>();

  const reload = () => {
    setRoom(getRoom(roomId));
    const l = getLeaseByRoom(roomId);
    setLease(l);
    if (l) {
      setCycles(listCycles(l.id));
      setDue(nextDueDate(l.id));
    } else {
      setCycles([]); setDue(undefined);
    }
  };
  useEffect(reload, [roomId]);

  const reminder = useMemo(()=> {
    if (!lease?.end_date) return null;
    const openCount = cycles.filter(c=> c.status !== 'settled' && c.period_end <= lease.end_date).length;
    return openCount <= 1 ? 'Sắp đến ngày kết thúc hợp đồng' : null;
  }, [lease, cycles]);

  return (
    <View style={{flex:1, padding:16, backgroundColor:c.bg}}>
      <Header title={`Phòng ${room?.code || ''}`} />
      <Card>
        <Text style={{color:c.text}}>Tầng: {room?.floor ?? '-'}</Text>
        <Text style={{color:c.text}}>Diện tích: {room?.area ?? '-'} m2</Text>
        <Text style={{color:c.text}}>Trạng thái: {room?.status}</Text>
      </Card>

      {!lease ? (
        <Card>
          <Text style={{color:c.text, marginBottom:8}}>Chưa có hợp đồng</Text>
          <Button title="Tạo hợp đồng" onPress={()=> navigation.navigate('LeaseForm', {roomId})} />
        </Card>
      ) : (
        <>
          <Card>
            <Text style={{color:c.text, fontWeight:'700'}}>Hợp đồng</Text>
            <Text style={{color:c.text}}>Bắt đầu: {lease.start_date}</Text>
            {lease.end_date ? <Text style={{color:c.text}}>Kết thúc: {lease.end_date}</Text> : null}
            {due ? <Text style={{color:c.text}}>Ngày thanh toán kỳ tới: {due}</Text> : null}
            {reminder ? <Text style={{color:'#EAB308', marginTop:6}}>{reminder}</Text> : null}
          </Card>

          <Card>
            <Text style={{color:c.text, fontWeight:'700', marginBottom:8}}>Chu kỳ thuê</Text>
            <FlatList
              data={cycles}
              keyExtractor={(i)=>i.id}
              renderItem={({item})=>(
                <View style={{flexDirection:'row', justifyContent:'space-between', marginVertical:6}}>
                  <Text style={{color:c.text}}>{item.period_start} → {item.period_end}</Text>
                  <Button
                    title={item.status==='settled'? 'Đã thanh toán' : 'Chưa thanh toán'}
                    variant={item.status==='settled'?'ghost':'primary'}
                    onPress={()=> navigation.navigate('CycleDetail', {cycleId: item.id})}
                  />
                </View>
              )}
            />
          </Card>

          <Button title="Kết thúc hợp đồng trước hạn" variant="danger" onPress={()=>{
            if (hasUnpaidCycles(lease.id)) {
              Alert.alert('Lưu ý', 'Còn kỳ chưa thanh toán, vui lòng thanh toán hết mới có thể kết thúc.');
              return;
            }
            Alert.alert('Xác nhận', 'Kết thúc hợp đồng này ngay?', [
              {text:'Huỷ'},
              {text:'Đồng ý', onPress: ()=> {
                try {
                  endLeaseEarly(lease.id, new Date().toISOString().slice(0,10));
                  Alert.alert('Đã kết thúc hợp đồng');
                  reload();
                } catch (e:any) {
                  Alert.alert('Lỗi', e?.message || 'Không thể kết thúc');
                }
              }}
            ]);
          }} />
        </>
      )}
    </View>
  );
}
