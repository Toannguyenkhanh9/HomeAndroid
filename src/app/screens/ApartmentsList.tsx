// src/app/screens/ApartmentsList.tsx
import React from 'react';
import {View, Text, FlatList, TouchableOpacity, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {query} from '../../db';
import {useThemeColors, cardStyle} from '../theme';
import Card from '../components/Card';
import Button from '../components/Button';
import ApartmentCreateModal from '../components/ApartmentCreateModal';
import {useFocusEffect} from '@react-navigation/native';
import {deleteApartment, hasUnpaidCycles} from '../../services/rent';

type Row = {id: string; name: string; address?: string | null};

type Stats = {
  total: number;
  available: number;
  occupied: number;
  endingSoon: number;
  overdue: number;
  unpaid: number;
  holdingDeposit: number;
};

type PillVariant = 'success' | 'warning' | 'muted';

const PRIMARY_BLUE = '#1B74FF';

const pillVariantForPercent = (p: number): PillVariant =>
  p >= 50 ? 'warning' : p > 0 ? 'success' : 'muted';

function PercentPill({value, variant}: {value: number; variant: PillVariant}) {
  const c = useThemeColors();

  const styleByVariant = {
    success: {bg: '#E9F7EF', bd: '#D1F0DE', tx: '#22A06B'},
    warning: {bg: '#FFF5E9', bd: '#FFE7C7', tx: '#E7962A'},
    muted: {bg: '#F2F4F8', bd: '#E5EAF1', tx: c.subtext},
  }[variant];

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: styleByVariant.bg,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: styleByVariant.bd,
      }}>
      <Text style={{color: styleByVariant.tx, fontWeight: '700', fontSize: 12}}>
        {Math.round(value)}%
      </Text>
    </View>
  );
}

function StatBox({
  icon,
  iconBg,
  label,
  value,
  percent,
  onPress,
}: {
  icon: string;
  iconBg: string;
  label: string;
  value: number;
  percent?: number;
  onPress?: () => void;
}) {
  const c = useThemeColors();
  const pillVar =
    typeof percent === 'number' ? pillVariantForPercent(percent) : 'muted';

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[cardStyle(c), {flex: 1, gap: 8, paddingVertical: 14}]}>
      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: iconBg,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}>
          <Text style={{fontSize: 16}}> {icon} </Text>
        </View>

        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <Text style={{color: c.text, fontSize: 18, fontWeight: '800'}}>
            {value}
          </Text>
          {typeof percent === 'number' ? (
            <PercentPill value={percent} variant={pillVar} />
          ) : null}
        </View>

        <View style={{flex: 1}} />
        <Text style={{fontSize: 18, color: c.subtext, opacity: 0.6}}>›</Text>
      </View>

      <Text style={{color: c.subtext, fontSize: 13}}>{label}</Text>
    </TouchableOpacity>
  );
}

// Nút tab segment
const TabBtn = ({
  title,
  icon,
  active,
  onPress,
}: {
  title: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) => {
  const c = useThemeColors();
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={{
        flex: 1,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: active ? PRIMARY_BLUE : c.border,
        backgroundColor: active ? PRIMARY_BLUE : '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
      }}>
      <Text style={{fontSize: 16, color: active ? '#fff' : c.text}}>{icon}</Text>
      <Text
        style={{
          color: active ? '#fff' : c.text,
          fontWeight: '700',
          fontSize: 15,
        }}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

export default function ApartmentsList({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ApartmentsList'>) {
  const c = useThemeColors();

  const [rows, setRows] = React.useState<Row[]>([]);
  const [showCreate, setShowCreate] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'manage' | 'overview'>(
    'manage',
  );

  const reload = React.useCallback(() => {
    const list = query<Row>(
      `SELECT id, name, address FROM apartments ORDER BY created_at DESC`,
    );
    setRows(list);
  }, []);

  useFocusEffect(React.useCallback(() => { reload(); }, [reload]));

  const getStatsForApartment = (apartmentId: string): Stats => {
    const total =
      query<{c: number}>(
        `SELECT COUNT(*) c FROM rooms WHERE apartment_id=?`,
        [apartmentId],
      )[0]?.c ?? 0;
    const occupied =
      query<{c: number}>(
        `SELECT COUNT(*) c FROM rooms WHERE apartment_id=? AND status='occupied'`,
        [apartmentId],
      )[0]?.c ?? 0;
    const available = total - occupied;

    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const day30 = in30.toISOString().slice(0, 10);

    const leases = query<{
      id: string;
      room_id: string;
      end_date?: string | null;
      deposit_amount?: number | null;
    }>(
      `SELECT l.id, l.room_id, l.end_date, l.deposit_amount
       FROM leases l
       JOIN rooms r ON r.id = l.room_id
       WHERE r.apartment_id = ? AND l.status='active'`,
      [apartmentId],
    );

    let endingSoon = 0,
      overdue = 0,
      unpaid = 0,
      holdingDeposit = 0;

    for (const L of leases) {
      if (L.deposit_amount && Number(L.deposit_amount) > 0) holdingDeposit++;
      if (L.end_date) {
        if (L.end_date >= today && L.end_date <= day30) endingSoon++;
        if (L.end_date < today) overdue++;
      }
      try {
        if (hasUnpaidCycles(L.id)) unpaid++;
      } catch {}
    }

    return {total, available, occupied, endingSoon, overdue, unpaid, holdingDeposit};
  };

  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      {/* Tabs */}
      <View style={{paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4}}>
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            backgroundColor: '#fff',
            borderRadius: 12,
            padding: 4,
            borderWidth: 1,
            borderColor: c.border,
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 6,
            shadowOffset: {width: 0, height: 2},
            elevation: 2,
          }}>
          <TabBtn
            title="Quản lý"
            icon="⚙️"
            active={activeTab === 'manage'}
            onPress={() => setActiveTab('manage')}
          />
          <TabBtn
            title="Tổng quan"
            icon="📈"
            active={activeTab === 'overview'}
            onPress={() => setActiveTab('overview')}
          />
        </View>
      </View>

      {/* TAB nội dung */}
      {activeTab === 'manage' ? (
        <>
          <FlatList
            data={rows}
            keyExtractor={i => i.id}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 96,
              paddingTop: 8,
              gap: 12,
            }}
            ListEmptyComponent={
              <View style={{paddingHorizontal: 16}}>
                <Card>
                  <Text style={{color: c.subtext}}>
                    Chưa có căn hộ nào. Nhấn nút + để thêm.
                  </Text>
                </Card>
              </View>
            }
            renderItem={({item}) => {
              const s = getStatsForApartment(item.id);
              return (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() =>
                    navigation.navigate('RoomForm', {apartmentId: item.id})
                  }
                  onLongPress={() => {
                    Alert.alert('Tuỳ chọn', `Xoá căn hộ "${item.name}"?`, [
                      {text: 'Huỷ'},
                      {
                        text: 'Xoá',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            deleteApartment(item.id);
                            reload();
                          } catch (e: any) {
                            Alert.alert(
                              'Không thể xoá',
                              e?.message || 'Vui lòng thử lại',
                            );
                          }
                        },
                      },
                    ]);
                  }}
                  style={[
                    cardStyle(c),
                    {flexDirection: 'row', alignItems: 'center', gap: 12},
                  ]}>
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: '#E7F2FF',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Text style={{fontSize: 26}}>🏢</Text>
                  </View>

                  <View style={{flex: 1}}>
                    <Text
                      style={{color: c.text, fontWeight: '800', fontSize: 16}}>
                      {item.name}
                    </Text>
                    {!!item.address && (
                      <Text style={{color: c.subtext, marginTop: 2}}>
                        {item.address}
                      </Text>
                    )}
                    <Text style={{color: c.subtext, marginTop: 6}}>
                      {s.total} phòng • {s.occupied} đang thuê • {s.available}{' '}
                      trống
                    </Text>
                  </View>

                  <Text style={{fontSize: 20, color: c.subtext, opacity: 0.6}}>
                    ›
                  </Text>
                </TouchableOpacity>
              );
            }}
          />

          {/* Nút Settings nhỏ bên trái */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={{
              position: 'absolute',
              left: 16,
              bottom: 24,
              backgroundColor: c.card,
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.08,
              shadowRadius: 6,
              shadowOffset: {width: 0, height: 2},
              elevation: 2,
              borderWidth: 1,
              borderColor: c.border,
            }}>
            <Text style={{fontSize: 22, color: c.text}}>⚙️</Text>
          </TouchableOpacity>

          {/* FAB thêm căn hộ */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setShowCreate(true)}
            style={{
              position: 'absolute',
              right: 16,
              bottom: 24,
              backgroundColor: c.primary,
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderRadius: 28,
              elevation: 3,
            }}>
            <Text style={{color: '#fff', fontWeight: '700'}}>+ Căn hộ</Text>
          </TouchableOpacity>

          <ApartmentCreateModal
            visible={showCreate}
            onClose={() => setShowCreate(false)}
            onCreated={reload}
          />
        </>
      ) : (
        // TAB Tổng quan
        <FlatList
          data={rows}
          keyExtractor={i => i.id}
          contentContainerStyle={{padding: 16, gap: 16, paddingBottom: 48}}
          renderItem={({item}) => {
            const s = getStatsForApartment(item.id);
            const occPct = s.total > 0 ? (s.occupied * 100) / s.total : 0;
            const availPct = s.total > 0 ? (s.available * 100) / s.total : 0;

            return (
              <View style={{gap: 12}}>
                <View style={[cardStyle(c)]}>
                  <Text
                    style={{color: c.text, fontWeight: '800', fontSize: 16}}>
                    {item.name}
                  </Text>
                  <Text style={{color: c.subtext}}>{item.address || '—'}</Text>
                  <Text style={{color: c.text, marginTop: 6}}>
                    Tổng số phòng:{' '}
                    <Text style={{fontWeight: '800'}}>{s.total}</Text>
                  </Text>

                  <View style={{flexDirection: 'row', gap: 10, marginTop: 10}}>
                    <Button
                      title="Quản lý"
                      onPress={() =>
                        navigation.navigate('RoomForm', {apartmentId: item.id})
                      }
                    />
                    <Button
                      title="Chi phí"
                      variant="ghost"
                      onPress={() =>
                        navigation.navigate('OperatingCosts', {
                          apartmentId: item.id,
                        })
                      }
                    />
                    <Button
                      title="Báo cáo"
                      variant="ghost"
                      onPress={() =>
                        navigation.navigate('ApartmentReport', {
                          apartmentId: item.id,
                        })
                      }
                    />
                  </View>
                </View>

                <View style={{flexDirection: 'row', gap: 12}}>
                  <StatBox
                    icon="🛒"
                    iconBg="#FDE9E7"
                    label="Số phòng có thể cho thuê"
                    value={s.available}
                    percent={availPct}
                  />
                  <StatBox
                    icon="📦"
                    iconBg="#FFE7E0"
                    label="Số phòng đang trống"
                    value={s.available}
                    percent={availPct}
                  />
                </View>
                <View style={{flexDirection: 'row', gap: 12}}>
                  <StatBox
                    icon="🧊"
                    iconBg="#E9F2FF"
                    label="Số phòng đang thuê"
                    value={s.occupied}
                    percent={occPct}
                  />
                  <StatBox
                    icon="⚠️"
                    iconBg="#FFF1D6"
                    label="Số phòng sắp kết thúc hợp đồng"
                    value={s.endingSoon}
                  />
                </View>
                <View style={{flexDirection: 'row', gap: 12}}>
                  <StatBox
                    icon="📝"
                    iconBg="#FFF4DB"
                    label="Số phòng báo kết thúc hợp đồng"
                    value={0}
                  />
                  <StatBox
                    icon="⏰"
                    iconBg="#EDEFF3"
                    label="Số phòng quá hạn hợp đồng"
                    value={s.overdue}
                  />
                </View>
                <View style={{flexDirection: 'row', gap: 12}}>
                  <StatBox
                    icon="💵"
                    iconBg="#EAF7EE"
                    label="Số phòng đang nợ tiền"
                    value={s.unpaid}
                  />
                  <StatBox
                    icon="⚓"
                    iconBg="#E6F2F1"
                    label="Số phòng đang cọc giữ chỗ"
                    value={s.holdingDeposit}
                  />
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{paddingHorizontal: 16}}>
              <Card>
                <Text style={{color: c.subtext}}>Chưa có căn hộ để thống kê.</Text>
              </Card>
            </View>
          }
        />
      )}
    </View>
  );
}
