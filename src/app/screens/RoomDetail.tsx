// src/app/screens/RoomDetail.tsx
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {
  getLeaseByRoom,
  getRoom,
  listCycles,
  nextDueDate,
  getTenant,
  getInvoiceItems,   // ⬅️ thêm để kiểm tra opening từ meta_json
} from '../../services/rent';
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
  const [tenantName, setTenantName] = useState<string>(''); // ⬅️ tên người thuê
  const {dateFormat, language} = useSettings();

  const loadAll = useCallback(() => {
    const r = getRoom(roomId);
    setRoom(r);

    const l = getLeaseByRoom(roomId);
    setLease(l);
    if (l) {
      setCycles(listCycles(l.id));
      // lấy tên người thuê nếu có
      try {
        const tnt = l?.tenant_id ? getTenant(l.tenant_id) : null;
        setTenantName(tnt?.full_name || '');
      } catch {
        setTenantName('');
      }
    } else {
      setCycles([]);
      setTenantName('');
    }
  }, [roomId]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const today = new Date().toISOString().slice(0, 10);

  // ===== Helpers nhận diện & render chu kỳ mở đầu =====
  const isOpeningCycle = (cy: any) => {
    if (cy?.is_opening === 1 || cy?.is_opening === true) return true;
    try {
      if (!cy?.invoice_id) return false;
      const items = (getInvoiceItems(cy.invoice_id) || []) as any[];
      for (const it of items) {
        if (!it?.meta_json) continue;
        try {
          const m = JSON.parse(it.meta_json);
          if (m?.opening === true) return true;
        } catch {}
      }
    } catch {}
    return false;
  };

  const labelForCycle = (cy: any) => {
    if (isOpeningCycle(cy)) return t('cycleDetail.openingCycle') || 'Kỳ Mở Đầu';
    return `${formatDateISO(cy.period_start, dateFormat, language)}  →  ${formatDateISO(
      cy.period_end,
      dateFormat,
      language,
    )}`;
  };

  // ===== Phân nhóm chu kỳ =====
  const openCycles = useMemo(
    () => cycles.filter(cy => String(cy.status) !== 'settled'),
    [cycles]
  );

  const currentCycle = useMemo(() => {
    if (!lease) return undefined;
    return openCycles.find(
      cy => String(cy.period_start) <= today && today <= String(cy.period_end)
    );
  }, [openCycles, lease, today]);

  const futureOpenSorted = useMemo(() => {
    return openCycles
      .filter(cy => String(cy.period_start) > today)
      .sort((a, b) => (a.period_start < b.period_start ? -1 : 1));
  }, [openCycles, today]);

  const overdueOpenSorted = useMemo(() => {
    // các chu kỳ trước hôm nay nhưng CHƯA tất toán
    return openCycles
      .filter(cy => String(cy.period_end) < today)
      .sort((a, b) => (a.period_start < b.period_start ? -1 : 1));
  }, [openCycles, today]);

  const mainCycle = currentCycle ?? futureOpenSorted[0];

  const settledList = useMemo(() => {
    const list = cycles
      .filter(cy => String(cy.status) === 'settled')
      .sort((a, b) => (a.period_start > b.period_start ? -1 : 1));
    if (!mainCycle) return list;
    return list.filter(cy => cy.id !== mainCycle.id);
  }, [cycles, mainCycle]);

  // Ngày đến hạn tiếp theo (safe)
  const nextDue = useMemo(() => {
    try {
      if (!lease) return null;
      return nextDueDate(lease.id) || null;
    } catch {
      return null;
    }
  }, [lease]);

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
              {/* ⬇️ dòng hiển thị tên người thuê */}
              <Text style={{color: c.subtext}}>
                {(t('cycleDetail.tenant') || t('leaseForm.tenantName') || 'Người thuê') + ':'}{' '}
                {tenantName || '—'}
              </Text>

              <Text style={{color: c.subtext}}>
                {t('startDate')}: {formatDateISO(lease.start_date, dateFormat, language)}
              </Text>
              <Text style={{color: c.subtext}}>
                {t('endDate')}: { lease.end_date ? formatDateISO(lease.end_date, dateFormat, language) : '—'}
              </Text>
              <Text style={{color: c.subtext}}>
                {t('nextDueDate')}: {nextDue ? formatDateISO(nextDue, dateFormat, language) : '—'}
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
                  {labelForCycle(mainCycle)}
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

        {/* Chu kỳ quá hạn (chưa tất toán) */}
        {overdueOpenSorted.length > 0 && (
          <Card>
            <Text style={{color: c.text, fontWeight: '800', marginBottom: 8}}>
              {t('overdueCycles') || 'Chu kỳ quá hạn (chưa tất toán)'}
            </Text>
            {overdueOpenSorted.map(cy => (
              <TouchableOpacity
                key={cy.id}
                onPress={() => navigation.navigate('CycleDetail', {cycleId: cy.id, onSettled: loadAll})}
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
                  {labelForCycle(cy)}
                </Text>
                <Text style={{fontStyle: 'italic', color: '#EF4444'}}>
                  {t('settledNo')}
                </Text>
              </TouchableOpacity>
            ))}
          </Card>
        )}

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
                  {labelForCycle(cy)}
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
