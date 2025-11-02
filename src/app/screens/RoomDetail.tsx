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
  getInvoiceItems,
  getCyclePaymentStatus,
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
  const [tenantName, setTenantName] = useState<string>('');
  const {dateFormat, language} = useSettings();

  const loadAll = useCallback(() => {
    const r = getRoom(roomId);
    setRoom(r);

    const l = getLeaseByRoom(roomId);
    setLease(l);
    if (l) {
      setCycles(listCycles(l.id));
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

  useEffect(() => {
    loadAll();
  }, [loadAll]);
  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll]),
  );

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
    if (isOpeningCycle(cy))
      return t('cycleDetail.openingCycle') || 'Kỳ Mở Đầu';
    return `${formatDateISO(
      cy.period_start,
      dateFormat,
      language,
    )}  →  ${formatDateISO(cy.period_end, dateFormat, language)}`;
  };

  // ===== Huy hiệu trạng thái chu kỳ (dựa vào thanh toán) =====
// ===== Huy hiệu trạng thái chu kỳ (dựa vào thanh toán) =====
const renderCycleStatusBadge = (cy: any) => {
  const st: any = getCyclePaymentStatus(cy.id) || {};

  // Hỗ trợ cả 2 dạng API: kind/state + số liệu
  const balance: number | undefined =
    typeof st.balance === 'number' ? st.balance : undefined;
  const paid: number | undefined =
    typeof st.paid === 'number' ? st.paid : undefined;

  const isOpen =
    st.kind === 'open' ||
    st.state === 'NONE' ||
    String(cy.status) !== 'settled';

  if (isOpen) {
    return (
      <Text style={{ fontStyle: 'italic', color: '#EF4444' }}>
        {t('settledNo')}
      </Text>
    );
  }

  const isFull =
    st.kind === 'paid' ||
    st.state === 'FULL' ||
    (balance != null ? balance <= 0 : false);

  if (isFull) {
    return (
      <Text style={{ fontStyle: 'italic', color: '#10B981' }}>
        {t('cycleDetail.badgePaid') || 'Đã thu tiền'}
      </Text>
    );
  }

  // settled nhưng CHƯA đủ tiền
  const isPartial =
    st.kind === 'partial' ||
    st.state === 'PARTIAL' ||
    (paid != null && paid > 0 && (balance == null || balance > 0));

  if (isPartial) {
    return (
      <Text style={{ fontStyle: 'italic', color: '#F59E0B' }}>
        {t('cycleDetail.partial') || 'Chưa thanh toán đủ'}
      </Text>
    );
  }

  // Fallback (hiếm khi xảy ra)
  return (
    <Text style={{ fontStyle: 'italic', color: '#F59E0B' }}>
      {t('cycleDetail.partial') || 'Chưa thanh toán đủ'}
    </Text>
  );
};

  // ===== Phân nhóm chu kỳ =====
  const openCycles = useMemo(
    () => cycles.filter(cy => String(cy.status) !== 'settled'),
    [cycles],
  );

  const currentCycle = useMemo(() => {
    if (!lease) return undefined;
    return openCycles.find(
      cy => String(cy.period_start) <= today && today <= String(cy.period_end),
    );
  }, [openCycles, lease, today]);

  const futureOpenSorted = useMemo(() => {
    return openCycles
      .filter(cy => String(cy.period_start) > today)
      .sort((a, b) => (a.period_start < b.period_start ? -1 : 1));
  }, [openCycles, today]);

  const overdueOpenSorted = useMemo(() => {
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
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
            }}>
            <Text style={{color: c.text, fontWeight: '800', fontSize: 18}}>
              {t('roomInfo')} {room?.code || ''}
            </Text>
            <Button
              title={t('history')}
              variant="ghost"
              onPress={() => navigation.navigate('LeaseHistory', {roomId})}
            />
          </View>

          <Text style={{color: c.subtext}}>
            {t('floor')}: {room?.floor ?? '—'}
          </Text>
          <Text style={{color: c.subtext}}>
            {t('acreage')}: {room?.area ?? '—'} m2
          </Text>
          <Text style={{color: c.subtext}}>
            {t('status')}:{' '}
            {room?.status === 'occupied' ? t('occupied') : t('available')}
          </Text>
        </Card>

        {/* Hợp đồng */}
        <Card>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
            <Text style={{color: c.text, fontWeight: '800'}}>
              {t('contract')}
            </Text>
            {lease ? (
              <Button
                title={t('viewDetail')}
                variant="ghost"
                onPress={() =>
                  navigation.navigate('LeaseDetail', {leaseId: lease.id})
                }
              />
            ) : null}
          </View>

          {lease ? (
            <>
              {/* ⬇️ dòng hiển thị tên người thuê */}
              <Text style={{color: c.subtext}}>
                {(t('cycleDetail.tenant') ||
                  t('leaseForm.tenantName') ||
                  'Người thuê') + ':'}{' '}
                {tenantName || '—'}
              </Text>

              <Text style={{color: c.subtext}}>
                {t('startDate')}:{' '}
                {formatDateISO(lease.start_date, dateFormat, language)}
              </Text>
              <Text style={{color: c.subtext}}>
                {t('endDate')}:{' '}
                {lease.end_date
                  ? formatDateISO(lease.end_date, dateFormat, language)
                  : '—'}
              </Text>
              <Text style={{color: c.subtext}}>
                {t('nextDueDate')}:{' '}
                {nextDue ? formatDateISO(nextDue, dateFormat, language) : '—'}
              </Text>
            </>
          ) : (
            <>
              <Text style={{color: c.subtext}}>{t('noContract')}</Text>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  gap: 10,
                }}>
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
          <Text
            style={{color: c.text, fontWeight: '800', marginBottom: 8}}>
            {t('leaseCycle')}
          </Text>
          {lease ? (
            mainCycle ? (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('CycleDetail', {
                    cycleId: mainCycle.id,
                    onSettled: loadAll,
                  })
                }
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: c.card,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                <Text style={{color: c.text}}>{labelForCycle(mainCycle)}</Text>
                {renderCycleStatusBadge(mainCycle)}
              </TouchableOpacity>
            ) : (
              <Text style={{color: c.subtext}}>{t('noCycle')}</Text>
            )
          ) : (
            <Text style={{color: c.subtext}}>{t('noLeaseNoCycle')}</Text>
          )}
        </Card>

        {/* Chu kỳ quá hạn (chưa tất toán) */}
        {overdueOpenSorted.length > 0 && (
          <Card>
            <Text
              style={{color: c.text, fontWeight: '800', marginBottom: 8}}>
              {t('overdueCycles') || 'Chu kỳ quá hạn (chưa tất toán)'}
            </Text>
            {overdueOpenSorted.map(cy => (
              <TouchableOpacity
                key={cy.id}
                onPress={() =>
                  navigation.navigate('CycleDetail', {
                    cycleId: cy.id,
                    onSettled: loadAll,
                  })
                }
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: c.card,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}>
                <Text style={{color: c.text}}>{labelForCycle(cy)}</Text>
                {/* Quá hạn thì chắc chắn open */}
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
            <Text
              style={{color: c.text, fontWeight: '800', marginBottom: 8}}>
              {t('cycleSettledList')}
            </Text>
            {settledList.map(cy => (
              <TouchableOpacity
                key={cy.id}
                onPress={() =>
                  navigation.navigate('CycleDetail', {cycleId: cy.id})
                }
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: c.card,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}>
                <Text style={{color: c.text}}>{labelForCycle(cy)}</Text>
                {renderCycleStatusBadge(cy)}
              </TouchableOpacity>
            ))}
          </Card>
        )}
      </View>
    </View>
  );
}
