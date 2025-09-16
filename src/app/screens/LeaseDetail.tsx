// src/app/screens/LeaseDetail.tsx
import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, TextInput, ScrollView, Alert, Modal, TouchableOpacity} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {useCurrency} from '../../utils/currency';
import {onlyDigits, groupVN} from '../../utils/number';
import {
  getLease,
  getTenant,
  listChargesForLease,
  updateRecurringChargePrice,
  // addCustomRecurringCharges,   // ❌ không dùng nữa
  addOrUpdateRecurringCharges,    // ✅ upsert theo tên
  updateLeaseBaseRent,
  listCycles,
  hasUnpaidCycles,
  endLeaseWithSettlement,
} from '../../services/rent';

type Props = NativeStackScreenProps<RootStackParamList, 'LeaseDetail'>;

type NewItem = {
  name: string;
  isVariable: boolean;
  unit?: string;
  price?: string;
  meterStart?: string;
};

export default function LeaseDetail({route, navigation}: Props) {
  const {leaseId} = route.params as any;
  const c = useThemeColors();
  const {format} = useCurrency();

  const [lease, setLease] = useState<any>();
  const [tenant, setTenant] = useState<any | null>(null);
  const [charges, setCharges] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);

  const [editMode, setEditMode] = useState(false);

  const [fixed, setFixed] = useState<Record<string, string>>({});
  const [vars, setVars] = useState<Record<string, {price: string; meter: string}>>({});
  const [baseRentText, setBaseRentText] = useState('');

  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const addEmptyItem = () =>
    setNewItems(prev => [...prev, {name: '', isVariable: false, unit: '', price: '', meterStart: ''}]);
  const updateItem = (idx: number, patch: Partial<NewItem>) =>
    setNewItems(prev => prev.map((it, i) => (i === idx ? {...it, ...patch} : it)));
  const removeItem = (idx: number) => setNewItems(prev => prev.filter((_, i) => i !== idx));

  // ----- Modal kết thúc trước hạn -----
  const [showEndModal, setShowEndModal] = useState(false);
  const [endExtras, setEndExtras] = useState<Array<{name: string; amount: string}>>([]);
  const addEndExtra = () => setEndExtras(p => [...p, {name: '', amount: ''}]);
  const updEndExtra = (i:number, patch: Partial<{name:string;amount:string}>) =>
    setEndExtras(p => p.map((x, idx) => idx===i ? {...x, ...patch} : x));
  const delEndExtra = (i:number) => setEndExtras(p => p.filter((_, idx) => idx!==i));

  const endExtrasSum = useMemo(
    () => endExtras.reduce((s, it) => s + (Number(onlyDigits(it.amount||'')) || 0), 0),
    [endExtras]
  );
  const deposit = Number(lease?.deposit_amount || 0);
  const finalBalance = deposit - endExtrasSum;

  const reload = () => {
    const l = getLease(leaseId);
    setLease(l);
    setBaseRentText(groupVN(String(l?.base_rent || 0)));
    setTenant(l?.tenant_id ? getTenant(l.tenant_id) : null);

    const list = listChargesForLease(leaseId) as any[];
    setCharges(list);

    const f: Record<string, string> = {};
    const v: Record<string, {price: string; meter: string}> = {};
    for (const it of list) {
      if (Number(it.is_variable) === 1) {
        v[it.charge_type_id] = {
          price: groupVN(String(it.unit_price || 0)),
          meter: groupVN(String(it.meter_start || 0)),
        };
      } else {
        f[it.charge_type_id] = groupVN(String(it.unit_price || 0));
      }
    }
    setFixed(f);
    setVars(v);

    try { setCycles(listCycles(leaseId) || []); } catch {}
  };

  useEffect(reload, [leaseId]);
  useFocusEffect(React.useCallback(() => { reload(); }, [leaseId]));

  // Helpers
  const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth()+n); return x; };
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
  const toYMD = (d: Date) => d.toISOString().slice(0,10);

  // Kết thúc dự kiến & số kỳ còn lại (monthly)
  const {endProjected, cyclesLeft} = useMemo(() => {
    if (!lease) return {endProjected: '—', cyclesLeft: '—' as any};
    const s = new Date(lease.start_date);
    const billing = String(lease.billing_cycle);
    const totalPlanned: number = Number(lease.duration_days || 0);

    let projected = '—';
    if (lease.end_date) {
      projected = lease.end_date;
    } else if (billing === 'monthly') {
      const months = totalPlanned > 0 ? totalPlanned : 1;
      projected = toYMD(addDays(addMonths(s, months), -1));
    } else if (billing === 'daily') {
      const days = Number(lease.duration_days || 1);
      projected = toYMD(addDays(s, Math.max(1, days) - 1));
    } else {
      projected = toYMD(addDays(new Date(s.getFullYear()+1, s.getMonth(), s.getDate()), -1));
    }

    if (billing !== 'monthly' || totalPlanned <= 0) return {endProjected: projected, cyclesLeft: '—'};
    const settled = cycles.filter((c:any) => String(c.status) === 'settled').length;
    const hasOpen = cycles.some((c:any) => String(c.status) !== 'settled');
    const used = settled + (hasOpen ? 1 : 0);
    const left = Math.max(0, totalPlanned - used);
    return {endProjected: projected, cyclesLeft: left};
  }, [lease, cycles]);

  function saveApplyNext() {
    const newBase = Number(onlyDigits(baseRentText)) || 0;
    if (newBase !== lease?.base_rent) updateLeaseBaseRent(leaseId, newBase);

    for (const [ctId, text] of Object.entries(fixed)) {
      updateRecurringChargePrice(leaseId, ctId, Number(onlyDigits(text)) || 0);
    }
    for (const [ctId, val] of Object.entries(vars)) {
      updateRecurringChargePrice(leaseId, ctId, Number(onlyDigits(val.price)) || 0);
    }

    const toCreate = newItems
      .filter(it => it.name.trim() && Number(onlyDigits(it.price || '')) > 0)
      .map(it => ({
        name: it.name.trim(),
        isVariable: !!it.isVariable,
        unit: (it.unit || '').trim() || (it.isVariable ? 'đv' : 'tháng'),
        price: Number(onlyDigits(it.price || '')) || 0,
        meterStart: it.isVariable ? Number(onlyDigits(it.meterStart || '')) || 0 : undefined,
      }));

    if (toCreate.length) addOrUpdateRecurringCharges(leaseId, toCreate); // ✅ upsert theo tên

    setEditMode(false);
    setNewItems([]);
    reload();
    Alert.alert('Đã lưu', 'Các thay đổi sẽ áp dụng cho các kỳ sau.');
  }

  const attemptEndEarly = () => {
    const today = toYMD(new Date());
    const openCycles = (cycles || []).filter((c:any) => String(c.status) !== 'settled');
    const blocking = openCycles.find((c:any) => today >= c.period_start && today <= c.period_end);
    if (blocking) {
      Alert.alert('Không thể kết thúc', 'Còn chu kỳ hiện tại chưa tất toán. Vui lòng tất toán trước.');
      return;
    }
    Alert.alert('Xác nhận', 'Bạn muốn kết thúc hợp đồng và tiến hành quyết toán cọc?', [
      {text: 'Huỷ', style: 'cancel'},
      {text: 'Đồng ý', onPress: () => setShowEndModal(true)},
    ]);
  };

  const SegBtn = ({active, title, onPress}:{active:boolean; title:string; onPress:()=>void}) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal:12, paddingVertical:8, borderRadius:10,
        backgroundColor: active ? '#1f3348' : c.card,
      }}>
      <Text style={{color: c.text, fontWeight: active ? '800' : '600'}}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{flex: 1, backgroundColor: 'transparent'}}>
      {/* <Header title="Hợp đồng" /> */}

      {!editMode ? (
        <ScrollView contentContainerStyle={{padding: 12, gap: 12}}>
          <Card>
            <Text style={{color: c.text, fontWeight: '800', marginBottom: 8}}>Người thuê</Text>
            {tenant ? (
              <>
                <Text style={{color: c.text}}>Tên: {tenant.full_name}</Text>
                <Text style={{color: c.text}}>CCCD/CMND: {tenant.id_number || '—'}</Text>
                <Text style={{color: c.text}}>Điện thoại: {tenant.phone || '—'}</Text>
              </>
            ) : (
              <Text style={{color: c.subtext}}>—</Text>
            )}
          </Card>
          <Card>
            <Text style={{color: c.text}}>Bắt đầu: {lease?.start_date || '—'}</Text>
            <Text style={{color: c.text}}>Kết thúc: {lease?.end_date || '—'}</Text>
            <Text style={{color: c.text}}>Loại: {lease?.lease_type}</Text>
            <Text style={{color: c.text}}>Chu kỳ: {lease?.billing_cycle}</Text>
            <Text style={{color: c.text}}>Giá thuê cơ bản: {format(lease?.base_rent || 0)}</Text>
            <Text style={{color: c.text}}>Tiền cọc: {format(lease?.deposit_amount || 0)}</Text>
            <Text style={{color: c.text}}>Trạng thái: {lease?.status}</Text>
          </Card>
          <Card style={{gap: 8}}>
            <Text style={{color: c.text, fontWeight: '800'}}>Các khoản phí đang áp dụng</Text>
            {charges.map(it => (
              // 🔑 dùng id của recurring_charges để tránh duplicate key
              <View key={it.id} style={{borderRadius: 10, padding: 10}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                  <Text style={{color: c.text, fontWeight: '700'}}>{it.name}</Text>
                  <Text style={{color: c.subtext}}>
                    {Number(it.is_variable) === 1 ? `Biến đổi (${it.unit || ''})` : 'Cố định'}
                  </Text>
                </View>
                <Text style={{color: c.subtext}}>
                  Đơn giá: <Text style={{color: c.text}}>{format(it.unit_price || 0)}</Text>
                  {Number(it.is_variable) === 1 && ` / ${it.unit || 'đv'}`}
                </Text>
                {Number(it.is_variable) === 1 && (
                  <Text style={{color: c.subtext}}>
                    Chỉ số đầu: <Text style={{color: c.text}}>{groupVN(String(it.meter_start || 0))}</Text>
                  </Text>
                )}
              </View>
            ))}
          </Card>

          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
            <Button title="Kết thúc hợp đồng trước hạn" variant="ghost" onPress={attemptEndEarly}/>
            <Button title="Thay đổi" onPress={() => setEditMode(true)} />
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{padding: 12, gap: 12}}>
          <Card>
            <Text style={{color: c.text, fontWeight: '800', marginBottom: 8}}>Giá thuê cơ bản (áp dụng kỳ sau)</Text>
            <TextInput
              keyboardType="numeric"
              value={baseRentText}
              onChangeText={setBaseRentText}
              onBlur={() => setBaseRentText(groupVN(baseRentText))}
              style={{
                borderRadius: 10,
                padding: 10,
                color: c.text,
                backgroundColor: c.card,
              }}
            />
          </Card>

          <Card style={{gap: 8}}>
            <Text style={{color: c.text, fontWeight: '800'}}>Phí cố định</Text>
            {charges.filter(i => Number(i.is_variable) !== 1).map(it => (
              <View key={it.id}>
                <Text style={{color: c.subtext}}>{it.name} ({it.unit || 'kỳ'})</Text>
                <TextInput
                  keyboardType="numeric"
                  value={fixed[it.charge_type_id] ?? ''}
                  onChangeText={t => setFixed(s => ({...s, [it.charge_type_id]: t}))}
                  onBlur={() => setFixed(s => ({...s, [it.charge_type_id]: groupVN(s[it.charge_type_id] || '')}))}
                  style={{
                    borderRadius: 10,
                    padding: 10,
                    color: c.text,
                    backgroundColor: c.card,
                  }}
                />
              </View>
            ))}
          </Card>

          <Card style={{gap: 8}}>
            <Text style={{color: c.text, fontWeight: '800'}}>Phí biến đổi</Text>
            {charges.filter(i => Number(i.is_variable) === 1).map(it => (
              <View key={it.id} style={{gap: 6}}>
                <Text style={{color: c.subtext}}>{it.name} ({it.unit || 'đv'})</Text>
                <TextInput
                  keyboardType="numeric"
                  value={vars[it.charge_type_id]?.price ?? ''}
                  onChangeText={t =>
                    setVars(s => ({...s, [it.charge_type_id]: {...(s[it.charge_type_id] || {meter: '0'}), price: t}}))
                  }
                  onBlur={() =>
                    setVars(s => ({
                      ...s,
                      [it.charge_type_id]: {
                        ...(s[it.charge_type_id] || {meter: '0'}),
                        price: groupVN(s[it.charge_type_id]?.price || ''),
                      },
                    }))
                  }
                  style={{
                    borderRadius: 10,
                    padding: 10,
                    color: c.text,
                    backgroundColor: c.card,
                  }}
                />
              </View>
            ))}
          </Card>

          {/* ==== Thêm khoản phí khác (có chọn Cố định / Biến đổi) ==== */}
          <Card style={{gap: 10}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
              <Text style={{color: c.text, fontWeight: '800'}}>Thêm khoản phí khác</Text>
              <Button title="+ Thêm" onPress={addEmptyItem} />
            </View>

            {newItems.map((it, idx) => (
              <View key={idx} style={{ borderRadius: 10, padding: 10, gap: 10}}>
                {/* Tên phí */}
                <TextInput
                  placeholder="Tên phí"
                  placeholderTextColor={c.subtext}
                  value={it.name}
                  onChangeText={t => updateItem(idx, {name: t})}
                  style={{
                     borderRadius: 10,
                    padding: 10, color: c.text, backgroundColor: c.card,
                  }}
                />

                {/* Chọn loại phí */}
                <View style={{flexDirection:'row', gap:8}}>
                  <SegBtn
                    title="Cố định"
                    active={!it.isVariable}
                    onPress={()=> updateItem(idx, {isVariable:false})}
                  />
                  <SegBtn
                    title="Biến đổi"
                    active={!!it.isVariable}
                    onPress={()=> updateItem(idx, {isVariable:true})}
                  />
                </View>

                {/* Đơn vị (tùy chọn) */}
                <TextInput
                  placeholder="Đơn vị (vd: tháng, kWh, m³...)"
                  placeholderTextColor={c.subtext}
                  value={it.unit}
                  onChangeText={t => updateItem(idx, {unit: t})}
                  style={{
                     borderRadius: 10,
                    padding: 10, color: c.text, backgroundColor: c.card,
                  }}
                />

                {/* Giá và Meter start (nếu biến đổi) */}
                <TextInput
                  placeholder={it.isVariable ? 'Giá / đơn vị' : 'Giá / kỳ'}
                  placeholderTextColor={c.subtext}
                  keyboardType="numeric"
                  value={it.price}
                  onChangeText={t => updateItem(idx, {price: t})}
                  onBlur={() => updateItem(idx, {price: groupVN(it.price || '')})}
                  style={{
                    borderRadius: 10,
                    padding: 10,
                    color: c.text,
                    backgroundColor: c.card,
                  }}
                />

                {it.isVariable && (
                  <TextInput
                    placeholder="Chỉ số đầu (meter start)"
                    placeholderTextColor={c.subtext}
                    keyboardType="numeric"
                    value={it.meterStart}
                    onChangeText={t => updateItem(idx, {meterStart: t})}
                    onBlur={() => updateItem(idx, {meterStart: groupVN(it.meterStart || '')})}
                    style={{
                      borderRadius: 10,
                      padding: 10,
                      color: c.text,
                      backgroundColor: c.card,
                    }}
                  />
                )}

                <Button title="Xoá" variant="ghost" onPress={() => removeItem(idx)} />
              </View>
            ))}
          </Card>

          <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 10}}>
            <Button title="Huỷ" variant="ghost" onPress={() => { setEditMode(false); setNewItems([]); }} />
            <Button title="Lưu" onPress={saveApplyNext} />
          </View>
        </ScrollView>
      )}

      {/* MODAL: Kết thúc hợp đồng trước hạn */}
      <Modal visible={showEndModal} transparent animationType="slide" onRequestClose={()=>setShowEndModal(false)}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'flex-end'}}>
          <View style={{backgroundColor:c.bg, padding:16, borderTopLeftRadius:16, borderTopRightRadius:16, gap:10, maxHeight:'90%'}}>
            <Text style={{color:c.text, fontWeight:'800', fontSize:16}}>Kết thúc hợp đồng trước hạn</Text>
            <Text style={{color:c.text}}>Tiền cọc hiện tại: {format(deposit)}</Text>

            <Card style={{gap:8}}>
              <Text style={{color:c.text, fontWeight:'700'}}>Phụ phí phát sinh</Text>
              {endExtras.map((ex, idx)=>(
                <View key={idx} style={{gap:6}}>
                  <TextInput
                    placeholder="Tên khoản"
                    placeholderTextColor={c.subtext}
                    value={ex.name}
                    onChangeText={t=>updEndExtra(idx,{name:t})}
                    style={{borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}
                  />
                  <View style={{flexDirection:'row',gap:8}}>
                    <TextInput
                      placeholder="Số tiền (+ trừ cọc)"
                      placeholderTextColor={c.subtext}
                      keyboardType="numeric"
                      value={ex.amount}
                      onChangeText={t=>updEndExtra(idx,{amount:t})}
                      onBlur={()=>updEndExtra(idx,{amount:groupVN(ex.amount||'')})}
                      style={{flex:1,borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}
                    />
                    <Button title="Xoá" variant="ghost" onPress={()=>delEndExtra(idx)}/>
                  </View>
                </View>
              ))}
              <Button title="+ Thêm khoản" variant="ghost" onPress={addEndExtra}/>
            </Card>

            <Card>
              <Text style={{color:c.text}}>Tổng phụ phí: {format(endExtrasSum)}</Text>
              {finalBalance > 0 && (<Text style={{color:c.text}}>Số tiền trả lại khách: {format(finalBalance)}</Text>)}
              {finalBalance < 0 && (<Text style={{color:c.text}}>Cần thu thêm của khách: {format(Math.abs(finalBalance))}</Text>)}
              {finalBalance === 0 && (<Text style={{color:c.text}}>Không phát sinh thêm.</Text>)}
            </Card>

            <View style={{flexDirection:'row', justifyContent:'flex-end', gap:10}}>
              <Button title="Huỷ" variant="ghost" onPress={()=>setShowEndModal(false)}/>
              <Button title="Kết thúc" onPress={()=>{
                const payload = endExtras
                  .filter(it=>it.name.trim())
                  .map(it=>({name: it.name.trim(), amount: Number(onlyDigits(it.amount||'')) || 0}));
                const res = endLeaseWithSettlement(leaseId, payload);
                setShowEndModal(false);
                const msg =
                  res.finalBalance > 0 ? `Trả lại khách ${format(res.finalBalance)}`
                  : res.finalBalance < 0 ? `Cần thu thêm của khách ${format(Math.abs(res.finalBalance))}`
                  : 'Không phát sinh thêm';
                Alert.alert('Đã kết thúc hợp đồng', msg, [{text:'OK', onPress:()=>{ navigation.goBack(); }}]);
              }}/>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
