// src/app/screens/RoomDetail.tsx
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
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

  const currentCycle = useMemo(() => {
    if (!lease) return undefined;
    return cycles.find(
      cy =>
        String(cy.period_start) <= today &&
        today <= String(cy.period_end) &&
        String(cy.status) !== 'settled',
    );
  }, [cycles, lease, today]);

  const upcomingCycle = useMemo(() => {
    if (!lease) return undefined;
    const list = cycles
      .filter(cy => String(cy.period_start) > today && String(cy.status) !== 'settled')
      .sort((a, b) => (a.period_start < b.period_start ? -1 : 1));
    return list[0];
  }, [cycles, lease, today]);

  const mainCycle = currentCycle ?? upcomingCycle;

  const settledList = useMemo(() => {
    const list = cycles
      .filter(cy => String(cy.status) === 'settled')
      .sort((a, b) => (a.period_start > b.period_start ? -1 : 1));
    if (!mainCycle) return list;
    return list.filter(cy => cy.id !== mainCycle.id);
  }, [cycles, mainCycle]);

  return (
    <View style={{flex: 1, backgroundColor: 'transparent'}}>


      <View style={{padding: 12, gap: 12}}>
        {/* Thông tin phòng */}
        <Card>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6}}>
            <Text style={{color: c.text, fontWeight: '800', fontSize: 18}}>
              Phòng {room?.code || ''}
            </Text>
            <Button
              title="Lịch sử"
              variant="ghost"
              onPress={() => navigation.navigate('LeaseHistory', {roomId})}
            />
          </View>

          <Text style={{color: c.subtext}}>Tầng: {room?.floor ?? '—'}</Text>
          <Text style={{color: c.subtext}}>Diện tích: {room?.area ?? '—'} m2</Text>
          <Text style={{color: c.subtext}}>Trạng thái: {room?.status}</Text>
        </Card>

        {/* Hợp đồng */}
        <Card>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
            <Text style={{color: c.text, fontWeight: '800'}}>Hợp đồng</Text>
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
              <Text style={{color: c.subtext}}>
                Ngày thanh toán kỳ tới: {nextDueDate(lease.id) || '—'}
              </Text>
            </>
          ) : (
            <>
              <Text style={{color: c.subtext}}>
                Chưa có hợp đồng. Hãy tạo hợp đồng cho phòng này.
              </Text>
              <View style={{flexDirection:'row', justifyContent:'flex-end', gap:10}}>
                <Button
                  title="Tạo hợp đồng"
                  onPress={() => navigation.navigate('LeaseForm', {roomId})}
                />
              </View>
            </>
          )}
        </Card>

        {/* Chu kỳ thuê (hiện tại hoặc sắp tới) */}
        <Card>
          <Text style={{color: c.text, fontWeight: '800', marginBottom: 8}}>Chu kỳ thuê</Text>
          {lease ? (
            mainCycle ? (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('CycleDetail', {cycleId: mainCycle.id, onSettled: loadAll})
                }
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: c.card,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                <Text style={{color: c.text}}>
                  {mainCycle.period_start}  →  {mainCycle.period_end}
                </Text>
                <Text
                  style={{
                    fontStyle: 'italic',
                    color: String(mainCycle.status) === 'settled' ? '#10B981' : '#EF4444',
                  }}>
                  {String(mainCycle.status) === 'settled' ? 'Đã Tất Toán' : 'Chưa Tất Toán'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={{color: c.subtext}}>Chưa có chu kỳ.</Text>
            )
          ) : (
            <Text style={{color: c.subtext}}>
              Chưa có hợp đồng nên chưa phát sinh chu kỳ.
            </Text>
          )}
        </Card>

        {/* Danh sách chu kỳ đã tất toán */}
        {settledList.length > 0 && (
          <Card>
            <Text style={{color: c.text, fontWeight: '800', marginBottom: 8}}>
              Chu kỳ đã tất toán
            </Text>
            {settledList.map(cy => (
              <TouchableOpacity
                key={cy.id}
                onPress={() => navigation.navigate('CycleDetail', {cycleId: cy.id})}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: c.card,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}>
                <Text style={{color: c.text}}>
                  {cy.period_start}  →  {cy.period_end}
                </Text>
                <Text style={{fontStyle: 'italic', color: '#10B981'}}>Đã Tất Toán</Text>
              </TouchableOpacity>
            ))}
          </Card>
        )}
      </View>
    </View>
  );
}
