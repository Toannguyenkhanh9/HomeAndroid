// src/app/screens/CycleDetail.tsx
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, TextInput, Alert, ScrollView, Modal,Share} from 'react-native';
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
  getRoom,
  getTenant,
  isLastCycle,
  endLeaseWithSettlement,
  // NEW: gia hạn hợp đồng + tạo chu kỳ mới
  extendLeaseAndAddCycles,
} from '../../services/rent';
import {useCurrency} from '../../utils/currency';
import {onlyDigits, groupVN} from '../../utils/number';

import RNHTMLtoPDF from 'react-native-html-to-pdf';
import ViewShot, {captureRef} from 'react-native-view-shot';

type Props = NativeStackScreenProps<RootStackParamList, 'CycleDetail'> & {
  route: { params: { cycleId: string; onSettled?: () => void } };
};

type ChargeRow = {
  charge_type_id: string;
  name: string;
  unit?: string | null;
  is_variable: number;
  unit_price: number;
  meter_start?: number;
  value: string;
};

type ExtraItem = { name: string; amount: string };

export default function CycleDetail({route, navigation}: Props) {
  const {cycleId, onSettled} = route.params as any;
  const c = useThemeColors();
  const {format} = useCurrency();
  const viewShotRef = useRef<ViewShot>(null);

  const [leaseId, setLeaseId] = useState<string>('');
  const [leaseInfo, setLeaseInfo] = useState<any>(null); // NEW: để biết billing_cycle
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [invId, setInvId] = useState<string | undefined>();
  const [invTotal, setInvTotal] = useState<number>(0);
  const [status, setStatus] = useState<'open' | 'settled'>('open');
  const [period, setPeriod] = useState<{ s: string; e: string }>({ s: '', e: '' });

  // Phòng/khách
  const [roomCode, setRoomCode] = useState<string>('');
  const [tenantName, setTenantName] = useState<string>('');
  const [tenantPhone, setTenantPhone] = useState<string>('');

  // settled snapshot
  const [settledItems, setSettledItems] = useState<any[]>([]);
  const [currentReadings, setCurrentReadings] = useState<Record<string, number>>({});

  // chỉnh sửa kỳ
  const [editMode, setEditMode] = useState(false);
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const addExtra = () => setExtras(prev => [...prev, { name: '', amount: '' }]);
  const updateExtra = (i: number, patch: Partial<ExtraItem>) =>
    setExtras(prev => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeExtra = (i: number) =>
    setExtras(prev => prev.filter((_, idx) => idx !== i));

  // ===== Modal kết thúc hợp đồng (quyết toán cọc) =====
  const [showEndModal, setShowEndModal] = useState(false);
  const [endExtras, setEndExtras] = useState<ExtraItem[]>([]);
  const addEndExtra = () => setEndExtras(p => [...p, {name: '', amount: ''}]);
  const updEndExtra = (i: number, patch: Partial<ExtraItem>) =>
    setEndExtras(p => p.map((x, idx) => (idx === i ? {...x, ...patch} : x)));
  const delEndExtra = (i: number) => setEndExtras(p => p.filter((_, idx) => idx !== i));
  const endExtrasTotal = useMemo(
    () => endExtras.reduce((s, it) => s + (Number(onlyDigits(it.amount || '')) || 0), 0),
    [endExtras]
  );
  const [depositPreview, setDepositPreview] = useState<number>(0);

  // ===== Modal gia hạn hợp đồng (nhập số tháng/ngày) =====
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendCount, setExtendCount] = useState<string>('');

  const reload = () => {
    const cyc = getCycle(cycleId);
    if (!cyc) return;
    setStatus(String(cyc.status) as any);
    setPeriod({ s: cyc.period_start, e: cyc.period_end });

    const lease = getLease(cyc.lease_id);
    setLeaseId(lease.id);
    setLeaseInfo(lease); // NEW
    setDepositPreview(Number(lease.deposit_amount || 0));

    try {
      const r = lease?.room_id ? getRoom(lease.room_id) : null;
      setRoomCode(r?.code || '');
    } catch {}
    try {
      const t = lease?.tenant_id ? getTenant(lease.tenant_id) : null;
      setTenantName(t?.full_name || '');
      setTenantPhone(t?.phone || '');
    } catch {}

    if (cyc.invoice_id) {
      setInvId(cyc.invoice_id);
      const inv = getInvoice(cyc.invoice_id);
      setInvTotal(inv?.total || 0);

      const items = getInvoiceItems(cyc.invoice_id) as any[];
      setSettledItems(items || []);

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
      setRows([]);
    } else {
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
      setInvId(undefined);
      setInvTotal(0);
      setCurrentReadings({});
      setSettledItems([]);
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

  const {elecTotal, waterTotal, previewElecTotal, previewWaterTotal} = useMemo(() => {
    const isWater = (u?: string|null) => (u||'').toLowerCase().includes('m3') || (u||'').includes('m³');
    const isElec  = (u?: string|null) => (u||'').toLowerCase().includes('kwh');
    let _elec = 0, _water = 0, _pElec = 0, _pWater = 0;

    if (status === 'settled' && invId) {
      const items = getInvoiceItems(invId) as any[];
      for (const it of items) {
        const unit = (it.unit || '').toLowerCase();
        if (unit.includes('kwh')) _elec += Number(it.amount)||0;
        if (unit.includes('m3') || unit.includes('m³')) _water += Number(it.amount)||0;
      }
    } else {
      for (const r of rows) {
        if (r.is_variable !== 1) continue;
        const current = Number(onlyDigits(r.value)) || 0;
        const consumed = Math.max(0, current - (r.meter_start || 0));
        const money = consumed * (r.unit_price || 0);
        if (isElec(r.unit)) _pElec += money;
        if (isWater(r.unit)) _pWater += money;
      }
    }
    return {elecTotal:_elec, waterTotal:_water, previewElecTotal:_pElec, previewWaterTotal:_pWater};
  }, [rows, status, invId]);

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

  // ====== Lưu kỳ & xử lý cuối kỳ ======
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

    // settle kỳ
    const variableInputs: Array<{ charge_type_id: string; quantity: number; meter_end?: number }> = [];
    const adjustments: Array<{ name: string; amount: number }> = [];

    for (const r of rows) {
      if (r.is_variable === 1) {
        const current = Number(onlyDigits(r.value)) || 0;
        const consumed = Math.max(0, current - (r.meter_start || 0));
        variableInputs.push({ charge_type_id: r.charge_type_id, quantity: consumed, meter_end: current });
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
    onSettled?.();

    // Nếu là chu kỳ cuối => hỏi tiếp
    if (isLastCycle(cycleId)) {
      Alert.alert(
        'Chu kỳ cuối',
        'Bạn muốn kết thúc hợp đồng hay tiếp tục duy trì?',
        [
          {text: 'Kết thúc hợp đồng', onPress: () => setShowEndModal(true)},
          {
            text: 'Tiếp tục duy trì',
            onPress: () => setShowExtendModal(true), // mở modal nhập thời gian gia hạn
          },
          {text: 'Đóng', style: 'cancel'},
        ]
      );
    } else {
      Alert.alert('Hoàn tất', 'Đã tất toán chu kỳ.');
    }
  }

  async function exportPdf() {
    if (!invId) return;
    const inv = getInvoice(invId);
    const items = getInvoiceItems(invId);
    const rowsHtml = items.map((i:any) => {
      let extraInfo = '';
      if (i.meta_json) {
        try {
          const m = JSON.parse(i.meta_json);
          if (m && typeof m.meter_start === 'number' && typeof m.meter_end === 'number') {
            extraInfo = `<div style="font-size:12px;color:#555">Chỉ số trước: ${groupVN(String(m.meter_start))} • Chỉ số này: ${groupVN(String(m.meter_end))}</div>`;
          }
          if (m?.for_period_start && m?.for_period_end) {
            extraInfo += `<div style="font-size:12px;color:#555">Thu cho kỳ: ${m.for_period_start} → ${m.for_period_end}</div>`;
          }
        } catch {}
      }
      return `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">
            ${i.description}
            ${extraInfo}
          </td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${i.quantity ?? 1} ${i.unit ?? ''}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${format(i.unit_price)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${format(i.amount)}</td>
        </tr>`;
    }).join('');
    const html = `
    <html><meta charSet="utf-8"/><body style="font-family:-apple-system,Roboto,sans-serif;">
    <h2>Hóa đơn kỳ ${inv.period_start} → ${inv.period_end}</h2>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;border:1px solid #ddd;padding:8px;">Khoản</th>
          <th style="text-align:right;border:1px solid #ddd;padding:8px;">SL</th>
          <th style="text-align:right;border:1px solid #ddd;padding:8px;">Đơn giá</th>
          <th style="text-align:right;border:1px solid #ddd;padding:8px;">Thành tiền</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colSpan="3" style="text-align:right;padding:8px;border:1px solid #ddd;"><b>Tổng</b></td>
          <td style="text-align:right;padding:8px;border:1px solid #ddd;"><b>${format(inv.total)}</b></td>
        </tr>
      </tfoot>
    </table>
    </body></html>`;
    const res = await RNHTMLtoPDF.convert({html, fileName:`invoice_${inv.id}`, base64:false});
    Alert.alert('Đã xuất PDF', res.filePath || '—');
  }
  async function shareImage() {
    try {
      if (!viewShotRef.current) return;
      const uri = await captureRef(viewShotRef, {format: 'png', quality: 1});
      await Share.share({
        url: uri, // iOS và Android đều nhận url file://
        message: 'Thông tin chu kỳ thuê', // dùng khi app nhận message
        title: 'Chia sẻ chu kỳ',
      });
    } catch (e: any) {
      Alert.alert('Không thể chia sẻ', e?.message || 'Vui lòng thử lại.');
    }
  }

  async function exportImage() {
    if (!viewShotRef.current) return;
    const uri = await captureRef(viewShotRef, {format:'png', quality:1});
    Alert.alert('Đã xuất ảnh', uri);
  }

  // ====== UI ======
  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ViewShot ref={viewShotRef} options={{format:'png', quality:1}}>
        {!editMode ? (
          <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} showsVerticalScrollIndicator>
            <Card>
              <Text style={{ color: c.text, fontWeight: '700', marginBottom: 6 }}>Thông tin phòng</Text>
              <Text style={{ color: roomCode ? c.text : c.subtext }}>Phòng: {roomCode || '—'}</Text>

              <Text style={{ color: c.text, fontWeight: '700', marginTop: 10, marginBottom: 6 }}>Người thuê</Text>
              {(tenantName || tenantPhone) ? (
                <Text style={{ color: c.text }}>
                  {tenantName || '—'}{tenantPhone ? ` — ${tenantPhone}` : ''}
                </Text>
              ) : (
                <Text style={{ color: c.subtext }}>Chưa có người thuê</Text>
              )}
            </Card>
                        <Card>
              <Text style={{ color: c.text }}>Kỳ: {period.s}  →  {period.e}</Text>
              <Text style={{ color: c.text }}>Trạng thái: {status}</Text>
              {invId ? <Text style={{ color: c.text }}>Tổng hoá đơn: {format(invTotal)}</Text> : null}
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>Các khoản phí</Text>

              {status === 'settled' && settledItems.length > 0 ? (
                <>
                  {settledItems.map(it => {
                    let meterInfo: {start?: number; end?: number} = {};
                    let forStart: string | undefined;
                    let forEnd: string | undefined;
                    if (it.meta_json) {
                      try {
                        const m = JSON.parse(it.meta_json);
                        if (typeof m?.meter_start === 'number') meterInfo.start = m.meter_start;
                        if (typeof m?.meter_end === 'number') meterInfo.end = m.meter_end;
                        if (m?.for_period_start) forStart = m.for_period_start;
                        if (m?.for_period_end)   forEnd   = m.for_period_end;
                      } catch {}
                    }
                    return (
                      <View key={it.id} style={{ borderRadius:10, padding:10 }}>
                        <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:6}}>
                          <Text style={{color:c.text, fontWeight:'700'}}>{it.description}</Text>
                          <Text style={{color:c.subtext}}>{it.unit ? `(${it.unit})` : 'Cố định'}</Text>
                        </View>

                        {forStart && forEnd ? (
                          <Text style={{color:c.subtext, marginBottom:4}}>
                            Thu cho kỳ: <Text style={{color:c.text}}>{forStart} → {forEnd}</Text>
                          </Text>
                        ) : null}

                        {!!(meterInfo.start != null || meterInfo.end != null) && (
                          <Text style={{color:c.subtext, marginBottom:4}}>
                            Chỉ số trước: <Text style={{color:c.text}}>{groupVN(String(meterInfo.start ?? 0))}</Text>{'  '}•{'  '}
                            Chỉ số này: <Text style={{color:c.text}}>{groupVN(String(meterInfo.end ?? 0))}</Text>
                          </Text>
                        )}

                        <Text style={{color:c.subtext}}>
                          SL: <Text style={{color:c.text}}>{it.quantity ?? 1}</Text> •{' '}
                          Đơn giá: <Text style={{color:c.text}}>{format(it.unit_price)}</Text> •{' '}
                          Thành tiền: <Text style={{color:c.text}}>{format(it.amount)}</Text>
                        </Text>
                      </View>
                    );
                  })}
                </>
              ) : (
                <>
                  {rows.map(r => (
                    <View key={r.charge_type_id}
                      style={{  borderRadius: 10, padding: 10 }}>
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
                  {/* <View style={{marginTop:6}}>
                    <Text style={{color:c.text}}>Điện (tạm tính): {format(previewElecTotal)}</Text>
                    <Text style={{color:c.text}}>Nước (tạm tính): {format(previewWaterTotal)}</Text>
                  </View> */}
                </>
              )}
            </Card>

            {status==='settled' ? (
              <View style={{flexDirection:'row', justifyContent:'flex-end', gap:10}}>
                <Button title="Chia Sẻ" onPress={shareImage}/>
              </View>
            ) : (
              <View style={{ alignItems: 'flex-end' }}>
                <Button title="Tất Toán" onPress={() => setEditMode(true)} />
              </View>
            )}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} showsVerticalScrollIndicator>
            <Card style={{ gap: 10 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>Các khoản phí</Text>

              {rows.map(r => {
                const isVar = r.is_variable === 1;
                const current = Number(onlyDigits(r.value)) || 0;
                const consumed = isVar ? Math.max(0, current - (r.meter_start || 0)) : 0;
                const partial = isVar ? consumed * (r.unit_price || 0) : Number(onlyDigits(r.value)) || 0;

                return (
                  <View key={r.charge_type_id}
                    style={{ borderRadius: 10, padding: 10 }}>
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
                          Chỉ số trước: <Text style={{ color: c.text }}>{groupVN(String(r.meter_start || 0))}</Text>
                        </Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                          <Text style={{ color: c.subtext, width: 120 }}>Chỉ số hiện tại</Text>
                          <TextInput
                            keyboardType="numeric"
                            value={r.value}
                            onChangeText={t => onChangeValue(r.charge_type_id, t)}
                            style={{
                              flex: 1,
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

              {/* Phụ phí phát sinh của kỳ */}
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
                         borderRadius: 10,
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
                          flex: 1, borderRadius: 10,
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

            <View style={{  alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Button title="Tất Toán" onPress={() => saveEdits('cycle')} />
              <Button title="Huỷ" variant="ghost" onPress={() => { setEditMode(false); setExtras([]); }} />
            </View>
          </ScrollView>
        )}
      </ViewShot>

      {/* ===== Modal kết thúc hợp đồng / quyết toán cọc ===== */}
      <Modal visible={showEndModal} transparent animationType="slide" onRequestClose={() => setShowEndModal(false)}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'flex-end'}}>
          <View style={{backgroundColor:c.bg, padding:16, borderTopLeftRadius:16, borderTopRightRadius:16, gap:10}}>
            <Text style={{color:c.text, fontWeight:'800', fontSize:16}}>Kết thúc hợp đồng</Text>
            <Text style={{color:c.text}}>Tiền cọc: {format(depositPreview)}</Text>

            <Card style={{gap:8}}>
              <Text style={{color:c.text, fontWeight:'700'}}>Phụ phí phát sinh</Text>
              {endExtras.map((ex, idx) => (
                <View key={idx} style={{ gap: 6 }}>
                  <TextInput
                    placeholder="Tên khoản"
                    placeholderTextColor={c.subtext}
                    value={ex.name}
                    onChangeText={t => updEndExtra(idx, { name: t })}
                    style={{borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
                  />
                  <View style={{flexDirection:'row', gap:8}}>
                    <TextInput
                      placeholder="Số tiền (+ là trừ cọc, - là hoàn thêm)"
                      placeholderTextColor={c.subtext}
                      keyboardType="numeric"
                      value={ex.amount}
                      onChangeText={t => updEndExtra(idx, { amount: t })}
                      onBlur={() => updEndExtra(idx, { amount: groupVN(ex.amount || '') })}
                      style={{flex:1, borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
                    />
                    <Button title="Xoá" variant="ghost" onPress={() => delEndExtra(idx)} />
                  </View>
                </View>
              ))}
              <Button title="+ Thêm khoản" variant="ghost" onPress={addEndExtra} />
            </Card>

            <Text style={{color:c.text}}>
              Tổng phát sinh: {format(endExtrasTotal)}
            </Text>
            <Text style={{color:c.text, fontWeight:'700'}}>
              Số dư sau quyết toán: {format(depositPreview - endExtrasTotal)}
            </Text>
            <Text style={{color:c.subtext}}>
              {depositPreview - endExtrasTotal > 0
                ? `→ Trả lại khách: ${format(depositPreview - endExtrasTotal)}`
                : depositPreview - endExtrasTotal < 0
                  ? `→ Cần thu thêm của khách: ${format(Math.abs(depositPreview - endExtrasTotal))}`
                  : '→ Không phát sinh thêm'}
            </Text>

            <View style={{flexDirection:'row', justifyContent:'flex-end', gap:10}}>
              <Button title="Hủy" variant="ghost" onPress={() => setShowEndModal(false)} />
              <Button
                title="Kết thúc"
                onPress={() => {
                  const payload = endExtras
                    .filter(it => it.name.trim())
                    .map(it => ({name: it.name.trim(), amount: Number(onlyDigits(it.amount || '')) || 0}));
                  const res = endLeaseWithSettlement(leaseId, payload);
                  setShowEndModal(false);
                  Alert.alert(
                    'Đã kết thúc hợp đồng',
                    res.finalBalance > 0
                      ? `Trả lại khách ${format(res.finalBalance)}`
                      : res.finalBalance < 0
                        ? `Cần thu thêm của khách ${format(Math.abs(res.finalBalance))}`
                        : 'Không phát sinh thêm',
                    [{text:'OK', onPress: () => navigation.goBack()}]
                  );
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Modal gia hạn hợp đồng (nhập số tháng/ngày) ===== */}
      <Modal visible={showExtendModal} transparent animationType="fade" onRequestClose={() => setShowExtendModal(false)}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'center', padding:16}}>
          <View style={{backgroundColor:c.bg, borderRadius:12, padding:16, gap:10}}>
            <Text style={{color:c.text, fontWeight:'800', fontSize:16}}>Gia hạn hợp đồng</Text>
            <Text style={{color:c.subtext}}>
              Nhập số {leaseInfo?.billing_cycle === 'daily' ? 'ngày' : 'tháng'} muốn gia hạn thêm.
            </Text>
            <TextInput
              keyboardType="numeric"
              value={extendCount}
              onChangeText={setExtendCount}
              placeholder={leaseInfo?.billing_cycle === 'daily' ? 'VD: 7 (ngày)' : 'VD: 3 (tháng)'}
              placeholderTextColor={c.subtext}
              style={{
                 borderRadius:10,
                padding:10, color:c.text, backgroundColor:c.card
              }}
            />
            <View style={{flexDirection:'row', justifyContent:'flex-end', gap:10}}>
              <Button title="Huỷ" variant="ghost" onPress={()=>{ setShowExtendModal(false); setExtendCount(''); }} />
              <Button title="Xác nhận" onPress={()=>{
                const n = Number(extendCount);
                if (!n || n<=0) { Alert.alert('Lỗi', 'Vui lòng nhập số hợp lệ.'); return; }
                try {
                  extendLeaseAndAddCycles(leaseId, n);
                  setShowExtendModal(false);
                  setExtendCount('');
                  reload();
                  Alert.alert('Thành công', 'Đã gia hạn và tạo chu kỳ mới.');
                } catch(e:any) {
                  Alert.alert('Lỗi', e?.message || 'Không thể gia hạn');
                }
              }}/>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
