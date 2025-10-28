// src/app/screens/ChargeCatalog.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useThemeColors, cardStyle } from '../theme';
import Card from '../components/Card';
import Button from '../components/Button';
import FormInput from '../components/FormInput';
import { useTranslation } from 'react-i18next';
import { query, exec } from '../../db';
import { formatDecimalTypingVNStrict, parseDecimalCommaStrict } from '../../utils/number';
import { useCurrency } from '../../utils/currency';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = NativeStackScreenProps<RootStackParamList, 'ChargeCatalog'>;

type CatalogRow = {
  id: string;
  apartment_id?: string | null;
  name: string;
  unit?: string | null;
  is_variable: number;    // 0 | 1
  unit_price: number;
  config_json?: string | null;
};

type Scope = 'apartment' | 'global';

function uuid() {
  // nhẹ, không cần lib
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 8) +
    '-' +
    Math.random().toString(36).slice(2, 8)
  );
}

// Đảm bảo bảng tồn tại (an toàn khi người dùng mở trực tiếp màn này)
function ensureCatalogTable() {
  exec(`
    CREATE TABLE IF NOT EXISTS catalog_charges (
      id TEXT PRIMARY KEY,
      apartment_id TEXT,
      name TEXT NOT NULL,
      unit TEXT,
      is_variable INTEGER NOT NULL DEFAULT 0, -- 0=fixed, 1=variable
      unit_price REAL NOT NULL DEFAULT 0,
      config_json TEXT
    )
  `);
}

export default function ChargeCatalog({ route }: Props) {
  const c = useThemeColors();
  const { t } = useTranslation();
  const { format } = useCurrency();
  const insets = useSafeAreaInsets();

  const apartmentId = (route.params as any)?.apartmentId as string | undefined;
  const [scope, setScope] = useState<Scope>(apartmentId ? 'apartment' : 'global');

  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Modal form state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [nameText, setNameText] = useState('');
  const [unitText, setUnitText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [isVar, setIsVar] = useState(false);

  const scopeLabel = useMemo(
    () => (scope === 'apartment' ? (t('catalog.scopeApartment') || 'Theo tòa') : (t('catalog.scopeGlobal') || 'Toàn hệ thống')),
    [scope, t]
  );

  const resetForm = () => {
    setEditing(null);
    setNameText('');
    setUnitText('');
    setPriceText('');
    setIsVar(false);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (row: CatalogRow) => {
    setEditing(row);
    setNameText(row.name || '');
    setUnitText(row.unit || '');
    setPriceText(
      // hiển thị theo vi-VN để người dùng sửa trực tiếp
      (Number(row.unit_price) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 })
    );
    setIsVar(Number(row.is_variable) === 1);
    setShowForm(true);
  };

  const load = useCallback(() => {
    ensureCatalogTable();
    try {
      let r: CatalogRow[] = [];
      if (scope === 'apartment') {
        if (!apartmentId) {
          setRows([]);
          return;
        }
        r = query<CatalogRow>(
          `SELECT id, apartment_id, name, unit, is_variable, unit_price, config_json
           FROM catalog_charges
           WHERE apartment_id = ?
           ORDER BY name COLLATE NOCASE`,
          [apartmentId]
        );
      } else {
        r = query<CatalogRow>(
          `SELECT id, apartment_id, name, unit, is_variable, unit_price, config_json
           FROM catalog_charges
           WHERE apartment_id IS NULL OR apartment_id = ''
           ORDER BY name COLLATE NOCASE`
        );
      }
      setRows(r || []);
    } catch (_e) {}
  }, [scope, apartmentId]);

  useEffect(load, [load]);

  const onSave = () => {
    const trimmed = nameText.trim();
    const unit = (unitText || '').trim();
    const price = parseDecimalCommaStrict(priceText || '');
    if (!trimmed) {
      Alert.alert(t('common.missingInfo'), t('catalog.requireName') || 'Vui lòng nhập tên phí.');
      return;
    }
    if (price < 0) {
      Alert.alert(t('common.missingInfo'), t('catalog.requirePrice') || 'Giá không hợp lệ.');
      return;
    }

    const scopeApartmentId = scope === 'apartment' ? (apartmentId || null) : null;

    try {
      if (editing) {
        exec(
          `UPDATE catalog_charges
           SET name = ?, unit = ?, is_variable = ?, unit_price = ?, apartment_id = ?
           WHERE id = ?`,
          [trimmed, unit || null, isVar ? 1 : 0, price, scopeApartmentId, editing.id]
        );
      } else {
        exec(
          `INSERT INTO catalog_charges (id, apartment_id, name, unit, is_variable, unit_price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuid(), scopeApartmentId, trimmed, unit || null, isVar ? 1 : 0, price]
        );
      }
      setShowForm(false);
      resetForm();
      load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('common.tryAgain'));
    }
  };

  const onDelete = (row: CatalogRow) => {
    Alert.alert(t('common.confirm') || 'Xác nhận', t('catalog.confirmDelete') || 'Xóa mục này?', [
      { text: t('common.cancel') || 'Hủy' },
      {
        text: t('common.delete') || 'Xóa',
        style: 'destructive',
        onPress: () => {
          try {
            exec(`DELETE FROM catalog_charges WHERE id=?`, [row.id]);
            load();
          } catch (e: any) {
            Alert.alert(t('common.error'), e?.message || t('common.tryAgain'));
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header + scope switch */}
      <View style={{ padding: 12, paddingBottom: 0 }}>
        <Card style={{ padding: 12, gap: 10 }}>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>
            {t('catalog.title') || 'Bảng giá'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              disabled={!apartmentId}
              onPress={() => setScope('apartment')}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: scope === 'apartment' ? '#10b981' : c.card,
                opacity: apartmentId ? 1 : 0.6,
              }}
            >
              <Text style={{ color: scope === 'apartment' ? 'white' : c.text }}>
                {t('catalog.scopeApartment') || 'Theo tòa'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setScope('global')}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: scope === 'global' ? '#10b981' : c.card,
              }}
            >
              <Text style={{ color: scope === 'global' ? 'white' : c.text }}>
                {t('catalog.scopeGlobal') || 'Toàn hệ thống'}
              </Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />
            <Button title={t('catalog.add') || 'Thêm'} onPress={openCreate} />
          </View>

          <Text style={{ color: c.subtext }}>
            {(t('catalog.currentScope') || 'Phạm vi') + ': '} {scopeLabel}
          </Text>
          {scope === 'apartment' && !apartmentId ? (
            <Text style={{ color: c.subtext }}>
              {t('catalog.apartmentHint') || 'Mở từ màn Phòng để thao tác theo tòa.'}
            </Text>
          ) : null}
        </Card>
      </View>

      {/* List */}
      <FlatList
        data={rows}
        keyExtractor={(it) => it.id}
        onRefresh={() => {
          setRefreshing(true);
          load();
          setRefreshing(false);
        }}
        refreshing={refreshing}
        contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: insets.bottom + 12 }}
        ListEmptyComponent={
          <Text style={{ color: c.subtext, textAlign: 'center', marginTop: 24 }}>
            {t('catalog.empty') || 'Chưa có mục nào.'}
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => openEdit(item)} activeOpacity={0.8}>
            <Card style={{ padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[cardStyle(c), { padding: 8, borderRadius: 10 }]}>
                  <Text style={{ fontSize: 18 }}>{item.is_variable ? '⚡️' : '📦'}</Text>
                </View>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>{item.name}</Text>
                  <Text style={{ color: c.subtext }}>
                    {(item.is_variable ? (t('leaseForm.variable') || 'Biến thiên') : (t('leaseForm.fixed') || 'Cố định'))}
                    {item.unit ? ` • ${item.unit}` : ''}
                  </Text>
                </View>
                <Text style={{ color: c.text, fontWeight: '700' }}>{format(item.unit_price || 0)}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <Button title={t('common.edit') || 'Sửa'} variant="ghost" onPress={() => openEdit(item)} />
                <Button title={t('common.delete') || 'Xóa'} variant="ghost" onPress={() => onDelete(item)} />
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {/* Modal add/edit */}
      <Modal visible={showForm} transparent animationType="fade" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 16 }}>
            <View style={{ backgroundColor: c.bg, borderRadius: 12, padding: 16, maxHeight: '85%' }}>
              <Text style={{ color: c.text, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>
                {editing ? (t('catalog.editTitle') || 'Sửa mục') : (t('catalog.addTitle') || 'Thêm mục')}
              </Text>

              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={{ color: c.subtext }}>{t('catalog.name') || 'Tên phí'}</Text>
                <FormInput value={nameText} onChangeText={setNameText} />

                <Text style={{ color: c.subtext, marginTop: 8 }}>{t('catalog.type') || 'Loại'}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setIsVar(false)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
                      backgroundColor: !isVar ? '#10b981' : c.card
                    }}
                  >
                    <Text style={{ color: !isVar ? 'white' : c.text }}>{t('leaseForm.fixed') || 'Cố định'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setIsVar(true)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
                      backgroundColor: isVar ? '#10b981' : c.card
                    }}
                  >
                    <Text style={{ color: isVar ? 'white' : c.text }}>{t('leaseForm.variable') || 'Biến thiên'}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ color: c.subtext, marginTop: 8 }}>{t('catalog.unit') || 'Đơn vị'}</Text>
                <FormInput
                  value={unitText}
                  onChangeText={setUnitText}
                  placeholder={isVar ? (t('rent.unit') || 'đơn vị') : (t('rent.month') || 'tháng')}
                />

                <Text style={{ color: c.subtext, marginTop: 8 }}>
                  {isVar ? (t('catalog.pricePerUnit') || 'Đơn giá/đơn vị') : (t('catalog.pricePerPeriod') || 'Đơn giá/kỳ')}
                </Text>
                <FormInput
                  keyboardType="decimal-pad"
                  value={priceText}
                  onChangeText={(txt) => setPriceText(formatDecimalTypingVNStrict(txt))}
                  placeholder="0,00"
                />

                <View style={{ height: 10 }} />
                <Text style={{ color: c.subtext }}>
                  {t('catalog.scopeNote') ||
                    'Lưu ý: Khi phạm vi là “Theo tòa”, mục này chỉ áp dụng cho tòa hiện tại. Khi là “Toàn hệ thống”, mục dùng làm mặc định cho mọi tòa.'}
                </Text>
              </ScrollView>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                <Button title={t('common.cancel') || 'Hủy'} variant="ghost" onPress={() => setShowForm(false)} />
                <Button title={t('common.save') || 'Lưu'} onPress={onSave} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
