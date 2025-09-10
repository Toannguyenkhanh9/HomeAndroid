import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {View, Text, TouchableOpacity, FlatList} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {getLeaseByRoom, getRoom, listCycles, nextDueDate} from '../../services/rent';

type Props = NativeStackScreenProps<RootStackParamList, 'RoomDetail'>;

export default function RoomDetail({route, navigation}: Props) {
  const {roomId} = route.params as any;
  const c = useThemeColors();

  const [room, setRoom] = useState<any>();
  const [lease, setLease] = useState<any>();
  const [cycles, setCycles] = useState<any[]>([]);

  const loadAll = useCallback(() => {
    const r = getRoom(roomId);
    setRoom(r);
    const l = getLeaseByRoom(roomId);
    setLease(l);
    if (l) setCycles(listCycles(l.id));
    else setCycles([]);
  }, [roomId]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const today = new Date().toISOString().slice(0, 10);

  // current hoặc upcoming gần nhất
  const cycleToShow = useMemo(() => {
    if (!lease) return undefined;
    const current = cycles.find(
      cy => String(cy.period_start) <= today && today <= String(cy.period_end),
    );
    if (current) return current;
    const future = cycles
      .filter(cy => String(cy.period_start) > today)
      .sort((a, b) => (a.period_start < b.period_start ? -1 : 1));
    return future[0];
  }, [cycles, lease, today]);

  // danh sách đã tất toán (mới → cũ)
  const settledList = useMemo(() => {
    return (cycles || [])
      .filter(cy => String(cy.status) === 'settled')
      .sort((a,b) => (a.period_start < b.period_start ? 1 : -1));
  }, [cycles]);

  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <Header title="Chi tiết phòng" />

      <View style={{padding: 12, gap: 12}}>
        {/* Thông tin phòng */}
        <Card>
          <Text style={{color: c.text, fontWeight: '800', fontSize: 18}}>
            Phòng {room?.code || ''}
          </Text>
          <Text style={{color: c.subtext}}>Tầng: {room?.floor ?? '—'}</Text>
          <Text style={{color: c.subtext}}>Diện tích: {room?.area ?? '—'} m2</Text>
          <Text style={{color: c.subtext}}>Trạng thái: {room?.status}</Text>
        </Card>

        {/* Hợp đồng */}
        <Card>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
            <Text style={{color:c.text, fontWeight:'800'}}>Hợp đồng</Text>
            {lease ? (
              <Button
                title="Xem chi tiết"
                variant="ghost"
                onPress={() => navigation.navigate('LeaseDetail', {leaseId: lease.id})}
              />
            ) : null}
          </View>

          {lease ? (
            <>
              <Text style={{color: c.subtext}}>Bắt đầu: {lease.start_date}</Text>
              <Text style={{color: c.subtext}}>Kết thúc: {lease.end_date || '—'}</Text>
              <Text style={{color: c.subtext}}>Ngày thanh toán kỳ tới: {nextDueDate(lease.id) || '—'}</Text>
            </>
          ) : (
            <Text style={{color: c.subtext}}>Chưa có hợp đồng. Hãy tạo hợp đồng cho phòng này.</Text>
          )}

          {!lease && (
            <View style={{marginTop: 8, alignItems: 'flex-end'}}>
              <Button title="Tạo hợp đồng" onPress={() => navigation.navigate('LeaseForm', {roomId})} />
            </View>
          )}
        </Card>

        {/* Chu kỳ hiện tại/gần nhất */}
        <Card>
          <Text style={{color: c.text, fontWeight: '800', marginBottom: 8}}>Chu kỳ thuê</Text>
          {lease ? (
            cycleToShow ? (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('CycleDetail', {
                    cycleId: cycleToShow.id,
                    onSettled: loadAll,  // để sau tất toán quay lại tự refresh & xuất hiện kỳ mới
                  })
                }
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#2A2F3A',
                  backgroundColor: c.card,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                <Text style={{color: c.text}}>
                  {cycleToShow.period_start}  →  {cycleToShow.period_end}
                </Text>
                <Text
                  style={{
                    fontStyle: 'italic',
                    color: String(cycleToShow.status) === 'settled' ? '#10B981' : '#EF4444',
                  }}>
                  {String(cycleToShow.status) === 'settled' ? 'Đã Tất Toán' : 'Chưa Tất Toán'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={{color: c.subtext}}>Chưa có chu kỳ.</Text>
            )
          ) : (
            <Text style={{color: c.subtext}}>Chưa có hợp đồng nên chưa phát sinh chu kỳ.</Text>
          )}
        </Card>

        {/* Danh sách chu kỳ đã tất toán (mới → cũ) */}
        {lease && (
          <Card>
            <Text style={{color:c.text, fontWeight:'800', marginBottom:8}}>Chu kỳ đã tất toán</Text>
            {settledList.length === 0 ? (
              <Text style={{color:c.subtext}}>Chưa có chu kỳ nào đã tất toán.</Text>
            ) : (
              <FlatList
                data={settledList}
                keyExtractor={i => i.id}
                ItemSeparatorComponent={() => <View style={{height:8}} />}
                renderItem={({item}) => (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('CycleDetail', {cycleId: item.id})}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#2A2F3A',
                      backgroundColor: c.card,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                    <Text style={{color: c.text}}>
                      {item.period_start} → {item.period_end}
                    </Text>
                    <Text style={{color:'#10B981', fontStyle:'italic'}}>Đã Tất Toán</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </Card>
        )}
      </View>

      {/* Nút kết thúc hợp đồng (dưới, bên phải) */}
      {lease ? (
        <View style={{position: 'absolute', right: 16, bottom: 16}}>
          <Button
            title="Kết thúc hợp đồng trước hạn"
            variant="danger"
            onPress={() => navigation.navigate('EndLeaseEarly', {leaseId: lease.id})}
          />
        </View>
      ) : null}
    </View>
  );
}
