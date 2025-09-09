import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, TextInput, Alert, ScrollView} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {
  getCycle,
  getLease,
  getInvoice,
  getInvoiceItems,
  listChargesForLease,
  settleCycleWithInputs,
  updateRecurringChargePrice,
} from '../../services/rent';
import {useCurrency} from '../../utils/currency';
import {onlyDigits, groupVN} from '../../utils/number';

type Props = NativeStackScreenProps<RootStackParamList, 'CycleDetail'>;

type ChargeRow = {
  charge_type_id: string;
  name: string;
  unit?: string | null;
  is_variable: number;
  unit_price: number;
  meter_start?: number;
  value: string; // edit: cố định=giá kỳ này, biến đổi=chỉ số hiện tại
};

type ExtraItem = { name: string; amount: string };

export default function CycleDetail({route}: Props) {
  const {cycleId} = route.params as any;
  const c = useThemeColors();
  const {format} = useCurrency();

  const [leaseId, setLeaseId] = useState<string>('');
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [invId, setInvId] = useState<string | undefined>();
  const [invTotal, setInvTotal] = useState<number>(0);
  const [status, setStatus] = useState<'open' | 'settled'>('open');
  const [period, setPeriod] = useState<{ s: string; e: string }>({ s: '', e: '' });

  // map charge_type_id -> meter_end (đọc từ invoice_items.meta_json khi đã tất toán)
  const [currentReadings, setCurrentReadings] = useState<Record<string, number>>({});

  const [editMode, setEditMode] = useState(false);
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const addExtra = () => setExtras(prev => [...prev, { name: '', amount: '' }]);
  const updateExtra = (i: number, patch: Partial<ExtraItem>) =>
    setExtras(prev => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeExtra = (i: number) =>
    setExtras(prev => prev.filter((_, idx) => idx !== i));

  const reload = () => {
    const cyc = getCycle(cycleId);
    if (!cyc) return;
    setStatus(String(cyc.status) as any);
    setPeriod({ s: cyc.period_start, e: cyc.period_end });

    const lease = getLease(cyc.lease_id);
    setLeaseId(lease.id);

    const list = listChargesForLease(lease.id) as any[];
    const normalized: ChargeRow[] = list.map(it => ({
      charge_type_id: it.charge_type_id,
      name: it.name,
      unit: it.unit,
      is_variable: Number(it.is_variable),
      unit_price: Number(it.unit_price) || 0,
      meter_start: Number(it.meter_start || 0),
      value: it.is_variable ? '' : groupVN(String(it.unit_price || 0)),
    }));
    setRows(normalized);

    if (cyc.invoice_id) {
      setInvId(cyc.invoice_id);
      const inv = getInvoice(cyc.invoice_id);
      setInvTotal(inv?.total || 0);

      // đọc invoice_items để lấy meter_end (nếu có)
      const items = getInvoiceItems(cyc.invoice_id) as any[];
      const map: Record<string, number> = {};
      for (const it of items) {
        if (it.charge_type_id && it.meta_json) {
          try {
            const m = JSON.parse(it.meta_json);
            if (typeof m?.meter_end === 'number') map[it.charge_type_id] = m.meter_end;
          } catch {}
        }
      }
      setCurrentReadings(map);
    } else {
      setInvId(undefined);
      setInvTotal(0);
      setCurrentReadings({});
    }
  };

  useEffect(reload, [cycleId]);

  const previewTotal = useMemo(() => {
    let sum = 0;
    for (const r of rows) {
      if (r.is_variable === 1) {
        const current = Number(onlyDigits(r.value)) || 0;
        const consumed = Math.max(0, current - (r.meter_start || 0));
        sum += consumed * (r.unit_price || 0);
      } else {
        sum += Number(onlyDigits(r.value)) || 0;
      }
    }
    for (const ex of extras) sum += Number(onlyDigits(ex.amount)) || 0;
    return sum;
  }, [rows, extras]);

  const onChangeValue = (id: string, text: string) => {
    setRows(prev => prev.map(r => (r.charge_type_id === id ? { ...r, value: text } : r)));
  };
  const onBlurValue = (id: string) => {
    setRows(prev =>
      prev.map(r => {
        if (r.charge_type_id !== id) return r;
        return r.is_variable === 1 ? r : { ...r, value: groupVN(r.value) };
      }),
    );
  };

  function saveEdits(scope: 'cycle' | 'lease') {
    if (scope === 'lease') {
      for (const r of rows) {
        if (r.is_variable === 0) {
          const newPrice = Number(onlyDigits(r.value)) || 0;
          if (newPrice !== r.unit_price) {
            updateRecurringChargePrice(leaseId, r.charge_type_id, newPrice);
          }
        }
      }
      Alert.alert('Đã lưu', 'Giá cố định đã cập nhật cho các kỳ sau.');
      setEditMode(false);
      reload();
      return;
    }

    const variableInputs: Array<{ charge_type_id: string; quantity: number }> = [];
    const adjustments: Array<{ name: string; amount: number }> = [];

    for (const r of rows) {
      if (r.is_variable === 1) {
        const current = Number(onlyDigits(r.value)) || 0;
        const consumed = Math.max(0, current - (r.meter_start || 0));
        variableInputs.push({ charge_type_id: r.charge_type_id, quantity: consumed });
      } else {
        const newPrice = Number(onlyDigits(r.value)) || 0;
        const delta = newPrice - (r.unit_price || 0);
        if (delta !== 0) adjustments.push({ name: `Điều chỉnh ${r.name}`, amount: delta });
      }
    }
    for (const ex of extras) {
      const amt = Number(onlyDigits(ex.amount)) || 0;
      if (ex.name.trim() && amt > 0) adjustments.push({ name: ex.name.trim(), amount: amt });
    }

    const inv = settleCycleWithInputs(cycleId, variableInputs, adjustments);
    setEditMode(false);
    setStatus('settled');
    setInvId(inv.id);
    setInvTotal(inv.total || 0);
    setExtras([]);
    reload();
    Alert.alert('Hoàn tất', 'Đã tất toán chu kỳ.');
  }

  const canEdit = status !== 'settled';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Chu kỳ" />

      {!editMode ? (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
          <Card>
            <Text style={{ color: c.text }}>Kỳ: {period.s}  →  {period.e}</Text>
            <Text style={{ color: c.text }}>Trạng thái: {status}</Text>
            {invId ? <Text style={{ color: c.text }}>Tổng hoá đơn: {format(invTotal)}</Text> : null}
          </Card>

          <Card style={{ gap: 10 }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>Các khoản phí</Text>

            {rows.map(r => (
              <View key={r.charge_type_id}
                style={{ borderWidth: 1, borderColor: '#263042', borderRadius: 10, padding: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>{r.name}</Text>
                  <Text style={{ color: c.subtext }}>
                    {r.is_variable ? `Biến đổi (${r.unit || ''})` : 'Cố định'}
                  </Text>
                </View>

                {r.is_variable === 1 ? (
                  <>
                    <Text style={{ color: c.subtext }}>
                      Đơn giá: <Text style={{ color: c.text }}>{format(r.unit_price)}</Text> / {r.unit || 'đv'}
                    </Text>
                    <Text style={{ color: c.subtext }}>
                      Chỉ số đầu: <Text style={{ color: c.text }}>{groupVN(String(r.meter_start || 0))}</Text>
                    </Text>
                    <Text style={{ color: c.subtext, marginTop: 4 }}>
                      Chỉ số hiện tại:{' '}
                      <Text style={{ color: c.text }}>
                        {currentReadings[r.charge_type_id] != null
                          ? groupVN(String(currentReadings[r.charge_type_id]))
                          : '— (chưa nhập)'}
                      </Text>
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: c.subtext }}>
                    Giá gốc hợp đồng: <Text style={{ color: c.text }}>{format(r.unit_price)}</Text>
                  </Text>
                )}
              </View>
            ))}

            {!invId ? (
              <Text style={{ color: c.subtext }}>
                Chưa tất toán — tổng tiền sẽ hiển thị sau khi nhập chỉ số và tất toán.
              </Text>
            ) : null}
          </Card>

          {canEdit ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Button title="Thay đổi" onPress={() => setEditMode(true)} />
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>Các khoản phí</Text>

            {rows.map(r => {
              const isVar = r.is_variable === 1;
              const current = Number(onlyDigits(r.value)) || 0;
              const consumed = isVar ? Math.max(0, current - (r.meter_start || 0)) : 0;
              const partial = isVar ? consumed * (r.unit_price || 0) : Number(onlyDigits(r.value)) || 0;

              return (
                <View key={r.charge_type_id}
                  style={{ borderWidth: 1, borderColor: '#263042', borderRadius: 10, padding: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: c.text, fontWeight: '700' }}>{r.name}</Text>
                    <Text style={{ color: c.subtext }}>
                      {isVar ? `Biến đổi (${r.unit || ''})` : 'Cố định'}
                    </Text>
                  </View>

                  {isVar ? (
                    <>
                      <Text style={{ color: c.subtext }}>
                        Đơn giá: <Text style={{ color: c.text }}>{format(r.unit_price)}</Text> / {r.unit || 'đv'}
                      </Text>
                      <Text style={{ color: c.subtext }}>
                        Chỉ số đầu: <Text style={{ color: c.text }}>{groupVN(String(r.meter_start || 0))}</Text>
                      </Text>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <Text style={{ color: c.subtext, width: 120 }}>Chỉ số hiện tại</Text>
                        <TextInput
                          keyboardType="numeric"
                          value={r.value}
                          onChangeText={t => onChangeValue(r.charge_type_id, t)}
                          style={{
                            flex: 1,
                            borderWidth: 1,
                            borderColor: '#2A2F3A',
                            backgroundColor: c.card,
                            color: c.text,
                            padding: 10,
                            borderRadius: 10,
                          }}
                        />
                      </View>

                      <Text style={{ color: c.subtext, marginTop: 6 }}>
                        Tiêu thụ: <Text style={{ color: c.text }}>{groupVN(String(consumed))}</Text> {r.unit || 'đv'} — Thành tiền:{' '}
                        <Text style={{ color: c.text }}>{format(partial)}</Text>
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ color: c.subtext }}>
                        Giá gốc hợp đồng: <Text style={{ color: c.text }}>{format(r.unit_price)}</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <Text style={{ color: c.subtext, width: 120 }}>Giá kỳ này</Text>
                        <TextInput
                          keyboardType="numeric"
                          value={r.value}
                          onChangeText={t => onChangeValue(r.charge_type_id, t)}
                          onBlur={() => onBlurValue(r.charge_type_id)}
                          style={{
                            flex: 1,
                            borderWidth: 1,
                            borderColor: '#2A2F3A',
                            backgroundColor: c.card,
                            color: c.text,
                            padding: 10,
                            borderRadius: 10,
                          }}
                        />
                      </View>
                      <Text style={{ color: c.subtext, marginTop: 6 }}>
                        Thành tiền: <Text style={{ color: c.text }}>{format(partial)}</Text>
                      </Text>
                    </>
                  )}
                </View>
              );
            })}

            {/* Phụ phí phát sinh */}
            <View style={{ marginTop: 4 }}>
              <Text style={{ color: c.text, fontWeight: '700', marginBottom: 6 }}>Phụ phí phát sinh</Text>
              {extras.map((ex, idx) => (
                <View key={idx} style={{ gap: 6, marginBottom: 8 }}>
                  <TextInput
                    placeholder="Tên khoản phí"
                    placeholderTextColor={c.subtext}
                    value={ex.name}
                    onChangeText={t => updateExtra(idx, { name: t })}
                    style={{
                      borderWidth: 1, borderColor: '#2A2F3A', borderRadius: 10,
                      padding: 10, color: c.text, backgroundColor: c.card,
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      placeholder="Số tiền"
                      placeholderTextColor={c.subtext}
                      keyboardType="numeric"
                      value={ex.amount}
                      onChangeText={t => updateExtra(idx, { amount: t })}
                      onBlur={() => updateExtra(idx, { amount: groupVN(ex.amount || '') })}
                      style={{
                        flex: 1, borderWidth: 1, borderColor: '#2A2F3A', borderRadius: 10,
                        padding: 10, color: c.text, backgroundColor: c.card,
                      }}
                    />
                    <Button title="Xoá" variant="ghost" onPress={() => removeExtra(idx)} />
                  </View>
                </View>
              ))}
              <Button title="+ Thêm phụ phí" variant="ghost" onPress={addExtra} />
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>
                Tạm tính theo nhập: {format(previewTotal)}
              </Text>
              {invId ? (
                <Text style={{ color: c.subtext }}>
                  (Hóa đơn hiện tại: {format(invTotal)})
                </Text>
              ) : null}
            </View>
          </Card>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Button title="Lưu (chu kỳ này)" onPress={() => saveEdits('cycle')} />
            <Button
              title="Lưu (toàn hợp đồng)"
              variant="ghost"
              onPress={() =>
                Alert.alert(
                  'Cập nhật đơn giá',
                  'Cập nhật giá cho các kỳ sau (chỉ phí cố định)?',
                  [{ text: 'Huỷ', style: 'cancel' }, { text: 'Đồng ý', onPress: () => saveEdits('lease') }],
                )
              }
            />
            <Button title="Huỷ" variant="ghost" onPress={() => { setEditMode(false); setExtras([]); }} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}
