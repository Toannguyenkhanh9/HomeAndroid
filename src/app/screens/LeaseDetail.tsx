// src/app/screens/LeaseDetail.tsx
import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, TextInput, ScrollView, Alert} from 'react-native';
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
  addCustomRecurringCharges,
   updateLeaseBaseRent,
  // nếu bạn có hàm này trong services/rent.ts thì import – để sửa giá thuê cơ bản
  // updateLeaseBaseRent,
} from '../../services/rent';

type Props = NativeStackScreenProps<RootStackParamList, 'LeaseDetail'>;

type NewItem = {
  name: string;
  isVariable: boolean;
  unit?: string;
  price?: string;
  meterStart?: string;
};

export default function LeaseDetail({route}: Props) {
  const {leaseId} = route.params as any;
  const c = useThemeColors();
  const {format} = useCurrency();

  const [lease, setLease] = useState<any>();
  const [tenant, setTenant] = useState<any | null>(null);
  const [charges, setCharges] = useState<any[]>([]);
  const [editMode, setEditMode] = useState(false);

  // editable
  const [baseRentText, setBaseRentText] = useState('');
  const [fixed, setFixed] = useState<Record<string, string>>({});
  const [vars, setVars] = useState<Record<string, {price: string; meter: string}>>({});

  // khoản phí mới
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const addEmptyItem = () => setNewItems(prev => [...prev, {name:'', isVariable:false, unit:'tháng', price:''}]);
  const updateItem = (idx:number, patch:Partial<NewItem>) =>
    setNewItems(prev => prev.map((it,i)=> i===idx ? {...it, ...patch} : it));
  const removeItem = (idx:number) => setNewItems(prev => prev.filter((_,i)=> i!==idx));

  const reload = () => {
    const l = getLease(leaseId);
    setLease(l);
    setBaseRentText(groupVN(String(l?.base_rent || 0)));

    setTenant(l?.tenant_id ? getTenant(l.tenant_id) : null);

    const list = listChargesForLease(leaseId) as any[];
    setCharges(list);

    const f: Record<string,string> = {};
    const v: Record<string,{price:string; meter:string}> = {};
    for (const it of list) {
      if (Number(it.is_variable) === 1) {
        v[it.charge_type_id] = {price: groupVN(String(it.unit_price||0)), meter: groupVN(String(it.meter_start||0))};
      } else {
        f[it.charge_type_id] = groupVN(String(it.unit_price||0));
      }
    }
    setFixed(f); setVars(v);
  };

  useEffect(reload, [leaseId]);
  useFocusEffect(React.useCallback(() => { reload(); }, [leaseId]));

  const endProjected = useMemo(() => {
    if (!lease) return '—';
    if (lease.end_date) return lease.end_date;
    try {
      const s = new Date(lease.start_date);
      if (lease.billing_cycle === 'yearly') s.setFullYear(s.getFullYear() + 1);
      else if (lease.billing_cycle === 'monthly') s.setMonth(s.getMonth() + 1);
      else s.setDate(s.getDate() + (lease.duration_days || 1));
      return s.toISOString().slice(0, 10);
    } catch { return '—'; }
  }, [lease]);

function saveApplyNext() {
  // 1) Giá thuê cơ bản
  const newBase = Number(onlyDigits(baseRentText)) || 0;
  updateLeaseBaseRent(leaseId, newBase);

  // 2) Đơn giá các khoản phí đang áp dụng
  for (const [ctId, text] of Object.entries(fixed)) {
    updateRecurringChargePrice(leaseId, ctId, Number(onlyDigits(text)) || 0);
  }
  for (const [ctId, val] of Object.entries(vars)) {
    updateRecurringChargePrice(leaseId, ctId, Number(onlyDigits(val.price)) || 0);
  }

  // 3) Tạo các khoản phí mới (áp dụng kỳ sau)
  const toCreate = newItems
    .filter(it => it.name.trim() && Number(onlyDigits(it.price || '')) > 0)
    .map(it => ({
      name: it.name.trim(),
      isVariable: !!it.isVariable,
      unit: (it.unit || '').trim() || (it.isVariable ? 'đv' : 'tháng'),
      price: Number(onlyDigits(it.price || '')) || 0,
      meterStart: it.isVariable ? Number(onlyDigits(it.meterStart || '')) || 0 : undefined,
    }));
  if (toCreate.length) addCustomRecurringCharges(leaseId, toCreate);

  setEditMode(false);
  setNewItems([]);
  reload();
  Alert.alert('Đã lưu', 'Các thay đổi sẽ áp dụng cho các kỳ sau.');
}


  return (
    <View style={{flex:1, backgroundColor:c.bg}}>
      <Header title="Hợp đồng" />

      {!editMode ? (
        <ScrollView contentContainerStyle={{padding:12, gap:12}}>
          <Card>
            <Text style={{color:c.text}}>Bắt đầu: {lease?.start_date || '—'}</Text>
            <Text style={{color:c.text}}>Kết thúc: {lease?.end_date || '—'}</Text>
            <Text style={{color:c.text}}>Kết thúc dự kiến: {endProjected}</Text>
            <Text style={{color:c.text}}>Loại: {lease?.lease_type}</Text>
            <Text style={{color:c.text}}>Chu kỳ: {lease?.billing_cycle}</Text>
            <Text style={{color:c.text}}>Giá thuê cơ bản (tiền nhà): {format(lease?.base_rent || 0)}</Text>
            <Text style={{color:c.text}}>Tiền cọc: {format(lease?.deposit_amount || 0)}</Text>
            <Text style={{color:c.text}}>Bao phí: {lease?.is_all_inclusive ? 'Có' : 'Không'}</Text>
            <Text style={{color:c.text}}>Trạng thái: {lease?.status}</Text>
          </Card>

          <Card>
            <Text style={{color: c.text, fontWeight: '800', marginBottom: 8}}>Người thuê</Text>
            {tenant ? (
              <>
                <Text style={{color: c.text}}>Tên: {tenant.full_name}</Text>
                <Text style={{color: c.text}}>CCCD/CMND: {tenant.id_number || '—'}</Text>
                <Text style={{color: c.text}}>Điện thoại: {tenant.phone || '—'}</Text>
              </>
            ) : (
              <Text style={{color: c.subtext}}>Không có thông tin</Text>
            )}
          </Card>

          <Card style={{gap:8}}>
            <Text style={{color:c.text, fontWeight:'800'}}>Các khoản phí đang áp dụng</Text>
            {charges.map(it => (
              <View key={it.charge_type_id} style={{borderWidth:1, borderColor:'#263042', borderRadius:10, padding:10}}>
                <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                  <Text style={{color:c.text, fontWeight:'700'}}>{it.name}</Text>
                  <Text style={{color:c.subtext}}>
                    {Number(it.is_variable) === 1 ? `Biến đổi (${it.unit || ''})` : 'Cố định'}
                  </Text>
                </View>
                <Text style={{color:c.subtext}}>
                  Đơn giá: <Text style={{color:c.text}}>{format(it.unit_price || 0)}</Text>
                  {Number(it.is_variable) === 1 && ` / ${it.unit || 'đv'}`}
                </Text>
                {Number(it.is_variable) === 1 && (
                  <Text style={{color:c.subtext}}>
                    Chỉ số đầu: <Text style={{color:c.text}}>{groupVN(String(it.meter_start || 0))}</Text>
                  </Text>
                )}
              </View>
            ))}
          </Card>

          <View style={{alignItems:'flex-end'}}>
            <Button title="Thay đổi" onPress={() => setEditMode(true)} />
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{padding:12, gap:12}}>
          <Card>
            <Text style={{color:c.text, fontWeight:'800', marginBottom:8}}>Giá thuê cơ bản</Text>
            <TextInput
              keyboardType="numeric"
              value={baseRentText}
              onChangeText={setBaseRentText}
              onBlur={()=> setBaseRentText(groupVN(baseRentText))}
              placeholderTextColor={c.subtext}
              style={{borderWidth:1, borderColor:'#2A2F3A', borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
            />
          </Card>

          <Card style={{gap:8}}>
            <Text style={{color:c.text, fontWeight:'800'}}>Phí cố định (áp dụng kỳ sau)</Text>
            {charges.filter(i=> Number(i.is_variable)!==1).map(it=>(
              <View key={it.charge_type_id}>
                <Text style={{color:c.subtext}}>{it.name} ({it.unit || 'kỳ'})</Text>
                <TextInput
                  keyboardType="numeric"
                  value={fixed[it.charge_type_id] ?? ''}
                  onChangeText={t => setFixed(s=> ({...s, [it.charge_type_id]: t}))}
                  onBlur={()=> setFixed(s => ({...s, [it.charge_type_id]: groupVN(s[it.charge_type_id] || '')}))}
                  style={{borderWidth:1, borderColor:'#2A2F3A', borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
                />
              </View>
            ))}
          </Card>

          <Card style={{gap:8}}>
            <Text style={{color:c.text, fontWeight:'800'}}>Phí biến đổi (áp dụng kỳ sau)</Text>
            {charges.filter(i=> Number(i.is_variable)===1).map(it=>(
              <View key={it.charge_type_id} style={{gap:6}}>
                <Text style={{color:c.subtext}}>{it.name} ({it.unit || 'đv'})</Text>
                <Text style={{color:c.subtext}}>Giá / đơn vị</Text>
                <TextInput
                  keyboardType="numeric"
                  value={vars[it.charge_type_id]?.price ?? ''}
                  onChangeText={t => setVars(s => ({...s, [it.charge_type_id]: {...(s[it.charge_type_id]||{meter:'0'}), price:t}}))}
                  onBlur={()=> setVars(s => ({...s, [it.charge_type_id]: {...(s[it.charge_type_id]||{meter:'0'}), price: groupVN(s[it.charge_type_id]?.price || '')}}))}
                  style={{borderWidth:1, borderColor:'#2A2F3A', borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
                />
                <Text style={{color:c.subtext}}>Chỉ số đầu (hiển thị cho biết)</Text>
                <TextInput
                  editable={false}
                  value={groupVN(String(it.meter_start || 0))}
                  style={{borderWidth:1, borderColor:'#2A2F3A', borderRadius:10, padding:10, color:c.subtext, backgroundColor:c.card}}
                />
              </View>
            ))}
          </Card>

          <Card style={{gap:10}}>
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
              <Text style={{color:c.text, fontWeight:'800'}}>Thêm khoản phí khác</Text>
              <Button title="+ Thêm" onPress={addEmptyItem}/>
            </View>

            {newItems.length === 0 ? <Text style={{color:c.subtext}}>Chưa có mục nào. Bấm “+ Thêm”.</Text> : null}

            {newItems.map((it, idx)=>(
              <View key={idx} style={{borderWidth:1, borderColor:'#263042', borderRadius:10, padding:10, gap:8}}>
                <TextInput
                  placeholder="Tên phí"
                  placeholderTextColor={c.subtext}
                  value={it.name}
                  onChangeText={t=> updateItem(idx, {name:t})}
                  style={{borderWidth:1, borderColor:'#2A2F3A', borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
                />
                <View style={{flexDirection:'row', gap:10, alignItems:'center'}}>
                  <Button title={it.isVariable ? 'Biến đổi' : 'Cố định'} onPress={()=> updateItem(idx, {isVariable: !it.isVariable})}/>
                  <View style={{flex:1}} />
                  <Button title="Xoá" variant="ghost" onPress={()=> removeItem(idx)} />
                </View>
                <TextInput
                  placeholder="Đơn vị (vd: tháng, kWh, m3)"
                  placeholderTextColor={c.subtext}
                  value={it.unit}
                  onChangeText={t=> updateItem(idx, {unit:t})}
                  style={{borderWidth:1, borderColor:'#2A2F3A', borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
                />
                <TextInput
                  placeholder={it.isVariable ? 'Giá / đơn vị' : 'Giá / kỳ'}
                  placeholderTextColor={c.subtext}
                  keyboardType="numeric"
                  value={it.price}
                  onChangeText={t=> updateItem(idx, {price:t})}
                  onBlur={()=> updateItem(idx, {price: groupVN(it.price || '')})}
                  style={{borderWidth:1, borderColor:'#2A2F3A', borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
                />
                {it.isVariable && (
                  <TextInput
                    placeholder="Chỉ số đầu (tuỳ chọn)"
                    placeholderTextColor={c.subtext}
                    keyboardType="numeric"
                    value={it.meterStart}
                    onChangeText={t=> updateItem(idx, {meterStart:t})}
                    onBlur={()=> updateItem(idx, {meterStart: groupVN(it.meterStart || '')})}
                    style={{borderWidth:1, borderColor:'#2A2F3A', borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
                  />
                )}
              </View>
            ))}
          </Card>

          <View style={{flexDirection:'row', justifyContent:'flex-end', gap:10}}>
            <Button title="Huỷ" variant="ghost" onPress={()=> { setEditMode(false); setNewItems([]); reload(); }} />
            <Button title="Lưu (áp dụng kỳ sau)" onPress={saveApplyNext} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}
