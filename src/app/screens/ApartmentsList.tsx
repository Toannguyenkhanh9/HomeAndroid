// src/app/screens/ApartmentsList.tsx
import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  Dimensions,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { query } from '../../db';
import { useThemeColors, cardStyle } from '../theme';
import Card from '../components/Card';
import Button from '../components/Button';
import ApartmentCreateModal from '../components/ApartmentCreateModal';
import { useFocusEffect } from '@react-navigation/native';
import { deleteApartment, hasUnpaidCycles } from '../../services/rent';
import { useTranslation } from 'react-i18next';

type Row = { id: string; name: string; address?: string | null };

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

function PercentPill({
  value,
  variant,
}: {
  value: number;
  variant: PillVariant;
}) {
  const c = useThemeColors();
  const styleByVariant = {
    success: { bg: '#E9F7EF', bd: '#D1F0DE', tx: '#22A06B' },
    warning: { bg: '#FFF5E9', bd: '#FFE7C7', tx: '#E7962A' },
    muted: { bg: '#F2F4F8', bd: '#E5EAF1', tx: c.subtext },
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
      }}
    >
      <Text
        style={{ color: styleByVariant.tx, fontWeight: '700', fontSize: 12 }}
      >
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
      style={[cardStyle(c), { flex: 1, gap: 8, paddingVertical: 14 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: iconBg,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <Text style={{ fontSize: 16 }}>{icon}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: '800' }}>
            {value}
          </Text>
          {typeof percent === 'number' ? (
            <PercentPill value={percent} variant={pillVar} />
          ) : null}
        </View>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 18, color: c.subtext, opacity: 0.6 }}>›</Text>
      </View>
      <Text style={{ color: c.subtext, fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

// Segment tabs
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
        backgroundColor: active ? PRIMARY_BLUE : '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
      }}
    >
      <Text style={{ fontSize: 16, color: active ? '#fff' : c.text }}>
        {icon}
      </Text>
      <Text
        style={{
          color: active ? '#fff' : c.text,
          fontWeight: '700',
          fontSize: 15,
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
};

// Icon chức năng (grid dưới)
function BigIcon({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: string;
  onPress: () => void;
}) {
  const c = useThemeColors();
  return (
    <View
      style={{
        width: '33.33%',
        paddingHorizontal: 8,
        paddingVertical: 12,
        alignItems: 'center',
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={{
          width: 78,
          height: 78,
          borderRadius: 39,
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: c.border,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <Text style={{ fontSize: 34 }}>{icon}</Text>
      </TouchableOpacity>
      <Text
        style={{
          marginTop: 8,
          textAlign: 'center',
          color: c.text,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// Tile căn hộ (grid 2 cột)
function ApartmentTile({
  row,
  stats,
  onPress,
  onLongPress,
}: {
  row: Row;
  stats: Stats;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const c = useThemeColors();
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.9}
      style={[cardStyle(c), { width: '48%', padding: 12, gap: 8 }]}
    >
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: '#E7F2FF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 30 }}>🏢</Text>
        </View>
      </View>
      <Text
        numberOfLines={1}
        style={{
          color: c.text,
          fontWeight: '800',
          fontSize: 15,
          textAlign: 'center',
        }}
      >
        {row.name}
      </Text>
      <Text numberOfLines={1} style={{ color: c.subtext, textAlign: 'center' }}>
        {stats.total} {t('tileRoomsShort')} • {stats.occupied}{' '}
        {t('tileOccupiedShort')}
      </Text>
    </TouchableOpacity>
  );
}

export default function ApartmentsList({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ApartmentsList'>) {
  const c = useThemeColors();
  const { t } = useTranslation();

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
  useFocusEffect(
    React.useCallback(() => {
      reload();
    }, [reload]),
  );

  const getStatsForApartment = (apartmentId: string): Stats => {
    const total =
      query<{ c: number }>(
        `SELECT COUNT(*) c FROM rooms WHERE apartment_id=?`,
        [apartmentId],
      )[0]?.c ?? 0;
    const occupied =
      query<{ c: number }>(
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
       FROM leases l JOIN rooms r ON r.id = l.room_id
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
    return {
      total,
      available,
      occupied,
      endingSoon,
      overdue,
      unpaid,
      holdingDeposit,
    };
  };

  const Container = ({ children }: { children: React.ReactNode }) => (
    <View style={{ width: '100%', maxWidth: 360, alignSelf: 'center' }}>
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {/* Tabs */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            backgroundColor: '#fff',
            borderRadius: 8,
            padding: 4,
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          <TabBtn
            title={t('manageTab')}
            icon="⚙️"
            active={activeTab === 'manage'}
            onPress={() => setActiveTab('manage')}
          />
          <TabBtn
            title={t('overviewTab')}
            icon="📈"
            active={activeTab === 'overview'}
            onPress={() => setActiveTab('overview')}
          />
        </View>
      </View>

      {activeTab === 'manage' ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        >
          <Container>
            <View
              style={{ alignItems: 'center', marginTop: 8, marginBottom: 12 }}
            >
              <View
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: c.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOpacity: 0.06,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }}
              >
                <Text style={{ fontSize: 64 }}>🏢</Text>
              </View>
              <Text
                style={{
                  marginTop: 10,
                  color: c.text,
                  fontWeight: '800',
                  fontSize: 16,
                }}
              >
                {t('yourApartments')}
              </Text>
            </View>

            <FlatList
              data={rows}
              keyExtractor={i => i.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={{
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
              renderItem={({ item }) => {
                const s = getStatsForApartment(item.id);
                return (
                  <ApartmentTile
                    row={item}
                    stats={s}
                    onPress={() =>
                      navigation.navigate('RoomForm', { apartmentId: item.id })
                    }
                    onLongPress={() => {
                      Alert.alert(
                        t('options'),
                        t('deleteApartmentConfirm', { name: item.name }),
                        [
                          { text: t('cancel') },
                          {
                            text: t('delete'),
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                deleteApartment(item.id);
                                reload();
                              } catch (e: any) {
                                Alert.alert(
                                  t('cannotDelete'),
                                  e?.message || t('tryAgain'),
                                );
                              }
                            },
                          },
                        ],
                      );
                    }}
                  />
                );
              }}
              ListEmptyComponent={
                <Card>
                  <Text style={{ color: c.subtext }}>
                    {t('emptyListManage')}
                  </Text>
                </Card>
              }
            />

            <View style={{ marginTop: 6 }}>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                <BigIcon
                  label={t('addApartment')}
                  icon="🏢"
                  onPress={() => setShowCreate(true)}
                />
                <BigIcon
                  label={t('tenants')}
                  icon="🧑‍🤝‍🧑"
                  onPress={() => navigation.navigate('TenantsList')}
                />
                <BigIcon
                  label={t('settings')}
                  icon="⚙️"
                  onPress={() => navigation.navigate('Settings')}
                />
                <BigIcon
                  label={t('helpmain')}
                  icon="❓"
                  onPress={() => navigation.navigate('HelpScreen')}
                />
              </View>
            </View>
          </Container>

          <ApartmentCreateModal
            visible={showCreate}
            onClose={() => setShowCreate(false)}
            onCreated={reload}
          />
        </ScrollView>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
          renderItem={({ item }) => {
            const s = getStatsForApartment(item.id);
            const occPct = s.total > 0 ? (s.occupied * 100) / s.total : 0;
            const availPct = s.total > 0 ? (s.available * 100) / s.total : 0;

            return (
              <View style={{ gap: 12 }}>
                <View style={[cardStyle(c)]}>
                  <Text
                    style={{ color: c.text, fontWeight: '800', fontSize: 16 }}
                  >
                    {item.name}
                  </Text>
                  <Text style={{ color: c.subtext }}>
                    {item.address || '—'}
                  </Text>
                  <Text style={{ color: c.text, marginTop: 6 }}>
                    {t('totalRooms')}{' '}
                    <Text style={{ fontWeight: '800' }}>{s.total}</Text>
                  </Text>

                  <View
                    style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}
                  >
                    <Button
                      title={t('manage')}
                      onPress={() =>
                        navigation.navigate('RoomForm', {
                          apartmentId: item.id,
                        })
                      }
                    />
                    <Button
                      title={t('operatingCostsBtn')}
                      variant="ghost"
                      onPress={() =>
                        navigation.navigate('OperatingCosts', {
                          apartmentId: item.id,
                        })
                      }
                    />
                    <Button
                      title={t('reportBtn')}
                      variant="ghost"
                      onPress={() =>
                        navigation.navigate('ApartmentReport', {
                          apartmentId: item.id,
                        })
                      }
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <StatBox
                    icon="🛒"
                    iconBg="#FDE9E7"
                    label={t('stat_canRent')}
                    value={s.available}
                    percent={availPct}
                  />
                  <StatBox
                    icon="📦"
                    iconBg="#FFE7E0"
                    label={t('stat_vacantRooms')}
                    value={s.available}
                    percent={availPct}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <StatBox
                    icon="🧊"
                    iconBg="#E9F2FF"
                    label={t('stat_occupiedRooms')}
                    value={s.occupied}
                    percent={occPct}
                  />
                  <StatBox
                    icon="⚠️"
                    iconBg="#FFF1D6"
                    label={t('stat_endingSoon')}
                    value={s.endingSoon}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <StatBox
                    icon="⏰"
                    iconBg="#EDEFF3"
                    label={t('stat_overdue')}
                    value={s.overdue}
                  />
                  <StatBox
                    icon="💳"
                    iconBg="#EAF7EE"
                    label={t('stat_unpaid')}
                    value={s.unpaid}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('HoldingDepositList')}
                  >
                    <StatBox
                      icon="🔒"
                      iconBg="#E6F2F1"
                      label={t('stat_holdingDeposit')}
                      value={s.holdingDeposit}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: 16 }}>
              <Card>
                <Text style={{ color: c.subtext }}>{t('emptyOverview')}</Text>
              </Card>
            </View>
          }
        />
      )}
    </View>
  );
}
