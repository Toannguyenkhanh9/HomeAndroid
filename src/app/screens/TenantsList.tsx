import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors, cardStyle} from '../theme';
import {useFocusEffect} from '@react-navigation/native';
import {query} from '../../db';
import {useTranslation} from 'react-i18next';
import {deleteTenant, updateTenant} from '../../services/rent';

type Props = NativeStackScreenProps<RootStackParamList, 'TenantsList'>;

type Row = {
  id: string;
  full_name: string;
  phone?: string | null;
  id_number?: string | null;
  lease_id?: string | null;
  lease_status?: string | null;
  room_code?: string | null;
};

const StatusPill = ({active}: {active: boolean}) => {
  const c = useThemeColors();
  const {t} = useTranslation();
  const map = active
    ? {bg: '#E9F7EF', bd: '#D1F0DE', tx: '#22A06B', label: t('tenantsList.active')}
    : {bg: '#F2F4F8', bd: '#E5EAF1', tx: c.subtext, label: t('tenantsList.ended')};
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: map.bg,
        borderWidth: 1,
        borderColor: map.bd,
      }}>
      <Text style={{color: map.tx, fontWeight: '700', fontSize: 12}}>
        {map.label}
      </Text>
    </View>
  );
};

const SegBtn = ({
  title,
  active,
  count,
  onPress,
}: {
  title: string;
  active: boolean;
  count?: number;
  onPress: () => void;
}) => {
  const c = useThemeColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={{
        flex: 1,
        height: 40,
        borderRadius: 10,
        backgroundColor: active ? '#1B74FF' : '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
        borderWidth: 1,
        borderColor: active ? '#1B74FF' : c.border,
      }}>
      <Text style={{color: active ? '#fff' : c.text, fontWeight: '700'}}>
        {title}
      </Text>
      {typeof count === 'number' ? (
        <View
          style={{
            minWidth: 20,
            paddingHorizontal: 6,
            height: 20,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active ? '#ffffff22' : '#F2F4F8',
          }}>
          <Text style={{fontSize: 12, color: active ? '#fff' : c.subtext}}>
            {count}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

export default function TenantsList({navigation}: Props) {
  const c = useThemeColors();
  const {t} = useTranslation();

  const [rows, setRows] = React.useState<Row[]>([]);
  const [keyword, setKeyword] = React.useState('');
  const [tab, setTab] = React.useState<'all' | 'active' | 'ended'>('all');

  // ==== Edit modal state ====
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [idNumber, setIdNumber] = React.useState('');
  const [note, setNote] = React.useState('');

  const openEdit = (row: Row) => {
    setEditing(row);
    setName(row.full_name || '');
    setPhone(row.phone || '');
    setIdNumber(row.id_number || '');
    setNote('');
  };
  const closeEdit = () => {
    setEditing(null);
    setName('');
    setPhone('');
    setIdNumber('');
    setNote('');
  };
  const saveEdit = async () => {
    try {
      if (!editing) return;
      if (!name.trim()) {
        Alert.alert(t('common.missingInfo'), t('tenantsList.nameRequired') || 'Vui lòng nhập tên');
        return;
      }
      updateTenant(editing.id, {
        full_name: name.trim(),
        phone: phone.trim(),
        id_number: idNumber.trim(),
        note: note.trim(),
      });
      closeEdit();
      reload();
      Alert.alert(t('common.success'), t('tenantsList.updatedOk') || 'Đã cập nhật');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('common.tryAgain'));
    }
  };

  const reload = React.useCallback(() => {
    const list = query<Row>(
      `
      SELECT
        t.id,
        t.full_name,
        t.phone,
        t.id_number,
        l.id         AS lease_id,
        l.status     AS lease_status,
        r.code       AS room_code
      FROM tenants t
      LEFT JOIN leases l
        ON l.tenant_id = t.id AND l.status = 'active'
      LEFT JOIN rooms r
        ON r.id = l.room_id
      ORDER BY t.created_at DESC
      `,
    );
    setRows(list);
  }, []);
  useFocusEffect(React.useCallback(() => void reload(), [reload]));

  const counts = React.useMemo(() => {
    let a = 0, e = 0;
    for (const r of rows) {
      if (r.lease_id && r.lease_status === 'active') a++;
      else e++;
    }
    return {all: rows.length, active: a, ended: e};
  }, [rows]);

  const filteredByTab = React.useMemo(() => {
    return rows.filter(r => {
      const isActive = !!r.lease_id && r.lease_status === 'active';
      if (tab === 'active') return isActive;
      if (tab === 'ended') return !isActive;
      return true;
    });
  }, [rows, tab]);

  const filtered = React.useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return filteredByTab;
    return filteredByTab.filter(
      r =>
        r.full_name.toLowerCase().includes(k) ||
        (r.phone || '').toLowerCase().includes(k) ||
        (r.room_code || '').toLowerCase().includes(k),
    );
  }, [filteredByTab, keyword]);

  const handleOpen = (row: Row) => {
    if (row.lease_id && row.lease_status === 'active') {
      navigation.navigate('LeaseDetail', {leaseId: row.lease_id});
    }
  };

  const confirmDelete = (row: Row) => {
    if (row.lease_id) {
      Alert.alert(t('tenantsList.deleteConfirmTitle'), t('tenantsList.deleteConfirm'));
      return;
    }
    Alert.alert(
      t('tenantsList.deleteConfirmTitle'),
      t('tenantsList.deleteConfirm', {name: row.full_name}),
      [
        {text: t('common.cancel')},
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              deleteTenant(row.id);
              reload();
            } catch (e: any) {
              Alert.alert(t('tenantsList.deleteFail'), e?.message || t('common.tryAgain'));
            }
          },
        },
      ],
    );
  };

  const Item = ({row}: {row: Row}) => {
    const isActive = !!row.lease_id && row.lease_status === 'active';
    return (
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => handleOpen(row)}
        style={[cardStyle(c), {padding: 12, gap: 10}]}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#E9F2FF',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={{fontSize: 18}}>🧑</Text>
          </View>
        </View>

        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <View style={{flex: 1}}>
            <Text style={{color: c.text, fontWeight: '800', fontSize: 15}}>
              {row.full_name || '—'}
            </Text>
            <Text style={{color: c.subtext, marginTop: 2}}>
              {row.phone || '—'}
              {row.room_code ? `  •  ${t('tenantsList.room')} ${row.room_code}` : ''}
            </Text>
          </View>
          <StatusPill active={isActive} />
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 6,
          }}>
          <Button title={t('common.edit') || 'Sửa'} variant="ghost" onPress={() => openEdit(row)} />
          {isActive ? (
            <Button
              title={t('tenantsList.viewLease')}
              onPress={() =>
                navigation.navigate('LeaseDetail', {leaseId: row.lease_id})
              }
            />
          ) : (
            <Button
              title={t('common.delete')}
              variant="danger"
              onPress={() => confirmDelete(row)}
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{flex: 1, backgroundColor: 'transparent'}}>
      <Header title={t('tenantsList.title')} />
      <View style={{paddingHorizontal: 12, paddingBottom: 12}}>
        {/* Search */}
        <TextInput
          placeholder={t('tenantsList.searchPh')}
          placeholderTextColor={c.subtext}
          value={keyword}
          onChangeText={setKeyword}
          style={{
            borderRadius: 10,
            padding: 10,
            backgroundColor: c.card,
            color: c.text,
            marginBottom: 10,
          }}
        />

        {/* Filters */}
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            marginBottom: 12,
            backgroundColor: '#fff',
            borderRadius: 10,
            padding: 4,
            borderWidth: 1,
            borderColor: c.border,
          }}>
          <SegBtn
            title={t('tenantsList.all')}
            active={tab === 'all'}
            count={counts.all}
            onPress={() => setTab('all')}
          />
          <SegBtn
            title={t('tenantsList.active')}
            active={tab === 'active'}
            count={counts.active}
            onPress={() => setTab('active')}
          />
          <SegBtn
            title={t('tenantsList.ended')}
            active={tab === 'ended'}
            count={counts.ended}
            onPress={() => setTab('ended')}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          ItemSeparatorComponent={() => <View style={{height: 10}} />}
          renderItem={({item}) => <Item row={item} />}
          ListEmptyComponent={
            <Card>
              <Text style={{color: c.subtext}}>{t('common.noData')}</Text>
            </Card>
          }
          contentContainerStyle={{paddingBottom: 24}}
        />
      </View>

      {/* ===== Edit tenant modal ===== */}
      <Modal
        visible={!!editing}
        transparent
        animationType="slide"
        onRequestClose={closeEdit}
      >
        <KeyboardAvoidingView
          style={{flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)'}}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={{
              backgroundColor: c.bg,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{color: c.text, fontWeight: '800', fontSize: 16}}>
              {t('tenantsList.editTenant') || 'Sửa thông tin người thuê'}
            </Text>

            <TextInput
              placeholder={t('leaseForm.tenantName')}
              placeholderTextColor={c.subtext}
              value={name}
              onChangeText={setName}
              style={{borderRadius: 10, padding: 10, backgroundColor: c.card, color: c.text}}
            />
            <TextInput
              placeholder={t('leaseForm.phone')}
              placeholderTextColor={c.subtext}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={{borderRadius: 10, padding: 10, backgroundColor: c.card, color: c.text}}
            />
            <TextInput
              placeholder={t('leaseForm.idNumber')}
              placeholderTextColor={c.subtext}
              value={idNumber}
              onChangeText={setIdNumber}
              style={{borderRadius: 10, padding: 10, backgroundColor: c.card, color: c.text}}
            />
            <TextInput
              placeholder={t('tenantsList.note') || 'Ghi chú'}
              placeholderTextColor={c.subtext}
              value={note}
              onChangeText={setNote}
              style={{borderRadius: 10, padding: 10, backgroundColor: c.card, color: c.text}}
            />

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 12,
                marginTop: 6,
              }}
            >
              <Button title={t('common.cancel')} variant="ghost" onPress={closeEdit} />
              <Button title={t('common.save') || 'Lưu'} onPress={saveEdit} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
