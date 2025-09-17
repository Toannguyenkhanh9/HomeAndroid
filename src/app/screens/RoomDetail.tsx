// src/app/screens/RoomDetail.tsx
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {getLeaseByRoom, getRoom, listCycles, nextDueDate} from '../../services/rent';
import {useSettings} from '../state/SettingsContext';
import {formatDateISO} from '../../utils/date';
import {useTranslation} from 'react-i18next';

type Props = NativeStackScreenProps<RootStackParamList, 'RoomDetail'>;

export default function RoomDetail({route, navigation}: Props) {
  const {t} = useTranslation();
  const {roomId} = route.params as any;
  const c = useThemeColors();

  const [room, setRoom] = useState<any>();
  const [lease, setLease] = useState<any>();
  const [cycles, setCycles] = useState<any[]>([]);
  const {dateFormat, language} = useSettings();

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
              {t('roomInfo')} {room?.code || ''}
            </Text>
            <Button
              title={t('history')}
              variant="ghost"
              onPress={() => navigation.navigate('LeaseHistory', {roomId})}
            />
          </View>

          <Text style={{color: c.subtext}}>{t('floor')}: {room?.floor ?? '—'}</Text>
          <Text style={{color: c.subtext}}>{t('acreage')}: {room?.area ?? '—'} m2</Text>
          <Text style={{color: c.subtext}}>{t('status')}: {room?.status === 'occupied' ?  t('occupied') : t('available')}</Text>
        </Card>

        {/* Hợp đồng */}
        <Card>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
            <Text style={{color: c.text, fontWeight: '800'}}>{t('contract')}</Text>
            {lease ? (
              <Button
                title={t('viewDetail')}
                variant="ghost"
                onPress={() => navigation.navigate('LeaseDetail', {leaseId: lease.id})}
              />
            ) : null}
          </View>

          {lease ? (
            <>
              <Text style={{color: c.subtext}}>
                {t('startDate')}: {formatDateISO(lease.start_date, dateFormat, language)}
              </Text>
              <Text style={{color: c.subtext}}>
                {t('endDate')}: { lease.end_date ? formatDateISO(lease.end_date, dateFormat, language) : '—'}
              </Text>
              <Text style={{color: c.subtext}}>
                {t('nextDueDate')}: {formatDateISO(nextDueDate(lease.id), dateFormat, language) || '—'}
              </Text>
            </>
          ) : (
            <>
              <Text style={{color: c.subtext}}>
                {t('noContract')}
              </Text>
              <View style={{flexDirection:'row', justifyContent:'flex-end', gap:10}}>
                <Button
                  title={t('createLease')}
                  onPress={() => navigation.navigate('LeaseForm', {roomId})}
                />
              </View>
            </>
          )}
        </Card>

        {/* Chu kỳ thuê (hiện tại hoặc sắp tới) */}
        <Card>
          <Text style={{color: c.text, fontWeight: '800', marginBottom: 8}}>{t('leaseCycle')}</Text>
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
                  {formatDateISO(mainCycle.period_start, dateFormat, language)}  →  {formatDateISO(mainCycle.period_end, dateFormat, language)}
                </Text>
                <Text
                  style={{
                    fontStyle: 'italic',
                    color: String(mainCycle.status) === 'settled' ? '#10B981' : '#EF4444',
                  }}>
                  {String(mainCycle.status) === 'settled' ? t('settledYes') : t('settledNo')}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={{color: c.subtext}}>{t('noCycle')}</Text>
            )
          ) : (
            <Text style={{color: c.subtext}}>
              {t('noLeaseNoCycle')}
            </Text>
          )}
        </Card>

        {/* Danh sách chu kỳ đã tất toán */}
        {settledList.length > 0 && (
          <Card>
            <Text style={{color: c.text, fontWeight: '800', marginBottom: 8}}>
              {t('cycleSettledList')}
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
                   {formatDateISO(cy.period_start, dateFormat, language)}  →   {formatDateISO(cy.period_end, dateFormat, language)}
                </Text>
                <Text style={{fontStyle: 'italic', color: '#10B981'}}>{t('settledYes')}</Text>
              </TouchableOpacity>
            ))}
          </Card>
        )}
      </View>
    </View>
  );
}
