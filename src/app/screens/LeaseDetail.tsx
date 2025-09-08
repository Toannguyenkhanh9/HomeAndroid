import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, TextInput, Alert, Switch} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {
  getLease,
  listCycles,
  listChargesForLease,
  updateRecurringChargePrice,
  addCustomChargeType,
  addRecurringCharge,
  updateRecurringChargeConfig,
} from '../../services/rent';
import {useCurrency} from '../../utils/currency';
import {groupVN, onlyDigits} from '../../utils/number';

type Props = NativeStackScreenProps<RootStackParamList, 'LeaseDetail'>;

type FixedRow = { id: string; name: string; unit?: string; price: string };
type VarRow = { id: string; name: string; unit?: string; unitPrice: string; meterStart: string };

export default function LeaseDetail({route}: Props) {
  const {leaseId} = route.params as any;
  const c = useThemeColors();
  const {format} = useCurrency();

  const [lease, setLease] = useState<any>();
  const [editMode, setEditMode] = useState(false);

  // phí cố định
  const [fixedRows, setFixedRows] = useState<FixedRow[]>([]);
  // phí biến đổi (điện, nước, …)
  const [varRows, setVarRows] = useState<VarRow[]>([]);

  // thêm khoản phí khác
  const [newName, setNewName] = useState('');
  const [newIsVar, setNewIsVar] = useState(false);
  const [newUnit, setNewUnit] = useState('tháng'); // kWh, m3, tháng…
  const [newPrice, setNewPrice] = useState('');

  useEffect(() => {
    const l = getLease(leaseId);
    setLease(l);

    const list = listChargesForLease(leaseId) as any[];
    const fx = list
      .filter(x => Number(x.is_variable) === 0)
      .map(x => ({
        id: x.charge_type_id,
        name: x.name,
        unit: x.unit,
        price: groupVN(String(x.unit_price || 0)),
      }));
    setFixedRows(fx);

    const vr = list
      .filter(x => Number(x.is_variable) === 1)
      .map(x => {
        let meterStart = 0;
        try {
          const cfg = x.config_json ? JSON.parse(x.config_json) : {};
          meterStart = Number(cfg?.meterStart) || 0;
        } catch {}
        return {
          id: x.charge_type_id,
          name: x.name,
          unit: x.unit,
          unitPrice: groupVN(String(x.unit_price || 0)),
          meterStart: groupVN(String(meterStart)),
        };
      });
    setVarRows(vr);
  }, [leaseId]);

  // ngày kết thúc dự kiến
  const projectedEnd = useMemo(() => {
    if (lease?.end_date) return lease.end_date;
    try {
      const cs = listCycles(leaseId);
      if (cs?.length) return cs[cs.length - 1].period_end;
    } catch {}
    return '—';
  }, [lease, leaseId]);

  function saveNextOnly() {
    // Lưu phí cố định
    for (const r of fixedRows) {
      const v = Number(onlyDigits(r.price)) || 0;
      updateRecurringChargePrice(leaseId, r.id, v);
    }
    // Lưu phí biến đổi: giá/đơn vị + meterStart
    for (const r of varRows) {
      const p = Number(onlyDigits(r.unitPrice)) || 0;
      const m = Number(onlyDigits(r.meterStart)) || 0;
      updateRecurringChargePrice(leaseId, r.id, p);
      updateRecurringChargeConfig(leaseId, r.id, {meterStart: m});
    }

    Alert.alert('Đã lưu', 'Cập nhật áp dụng cho các chu kỳ sau.');
    setEditMode(false);
  }

  async function addNewCharge() {
    if (!newName.trim()) return Alert.alert('Nhập tên khoản phí');
    const def = Number(onlyDigits(newPrice)) || 0;
    // tạo charge type + gán vào hợp đồng hiện tại
    const ctId = addCustomChargeType(newName.trim(), newIsVar, newUnit || undefined, def);
    addRecurringCharge(leaseId, ctId, def, newIsVar ? 1 : 0);
    // thêm vào UI list
    if (newIsVar) {
      setVarRows(prev => [...prev, {id: ctId, name: newName.trim(), unit: newUnit, unitPrice: groupVN(String(def)), meterStart: '0'}]);
    } else {
      setFixedRows(prev => [...prev, {id: ctId, name: newName.trim(), unit: newUnit, price: groupVN(String(def))}]);
    }
    setNewName(''); setNewUnit('tháng'); setNewPrice(''); setNewIsVar(false);
    Alert.alert('Thành công', 'Đã thêm khoản phí vào hợp đồng (áp dụng từ kỳ sau).');
  }

  return (
    <View style={{flex:1, backgroundColor:c.bg}}>

      {!editMode ? (
        <View style={{padding:12, gap:12}}>
          <Card>
            <Text style={{color:c.text}}>Bắt đầu: {lease?.start_date}</Text>
            <Text style={{color:c.text}}>Kết thúc: {lease?.end_date || '—'}</Text>
            <Text style={{color:c.text}}>Kết thúc dự kiến: {projectedEnd}</Text>
            <Text style={{color:c.text}}>Loại: {lease?.lease_type}</Text>
            <Text style={{color:c.text}}>Chu kỳ: {lease?.billing_cycle}</Text>
            <Text style={{color:c.text}}>
              Giá thuê cơ bản (tiền nhà): {format(Number(lease?.base_rent||0))}
            </Text>
            <Text style={{color:c.text}}>
              Tiền cọc: {format(Number(lease?.deposit_amount||0))}
            </Text>
            <Text style={{color:c.text}}>
              Bao phí: {Number(lease?.is_all_inclusive) === 1 ? 'Có' : 'Không'}
            </Text>
            <Text style={{color:c.text}}>Trạng thái: {lease?.status}</Text>
          </Card>

          <View style={{alignItems:'flex-end'}}>
            <Button title="Thay đổi" onPress={()=> setEditMode(true)} />
          </View>
        </View>
      ) : (
        <View style={{padding:12, gap:12}}>
          {/* Phí cố định */}
          <Card>
            <Text style={{color:c.text, fontWeight:'800'}}>Phí cố định (áp dụng kỳ sau)</Text>
            {fixedRows.map(r => (
              <View key={r.id} style={{gap:6, marginTop:8}}>
                <Text style={{color:c.text}}>{r.name}{r.unit ? ` (${r.unit})` : ''}</Text>
                <TextInput
                  keyboardType="numeric"
                  value={r.price}
                  onChangeText={t=> setFixedRows(prev => prev.map(x => x.id===r.id ? {...x, price:t} : x))}
                  onBlur={()=> setFixedRows(prev => prev.map(x => x.id===r.id ? {...x, price: groupVN(x.price)} : x))}
                  style={{borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}
                />
              </View>
            ))}
          </Card>

          {/* Phí biến đổi (điện, nước…) */}
          <Card>
            <Text style={{color:c.text, fontWeight:'800'}}>Phí biến đổi (áp dụng kỳ sau)</Text>
            {varRows.length === 0 ? (
              <Text style={{color:c.subtext, marginTop:6}}>Chưa có phí biến đổi.</Text>
            ) : null}
            {varRows.map(r => (
              <View key={r.id} style={{gap:6, marginTop:8}}>
                <Text style={{color:c.text}}>{r.name}{r.unit ? ` (${r.unit})` : ''}</Text>
                <Text style={{color:c.subtext}}>Giá / đơn vị</Text>
                <TextInput
                  keyboardType="numeric"
                  value={r.unitPrice}
                  onChangeText={t=> setVarRows(prev => prev.map(x => x.id===r.id ? {...x, unitPrice:t} : x))}
                  onBlur={()=> setVarRows(prev => prev.map(x => x.id===r.id ? {...x, unitPrice: groupVN(x.unitPrice)} : x))}
                  style={{borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}
                />
                <Text style={{color:c.subtext}}>Chỉ số đầu</Text>
                <TextInput
                  keyboardType="numeric"
                  value={r.meterStart}
                  onChangeText={t=> setVarRows(prev => prev.map(x => x.id===r.id ? {...x, meterStart:t} : x))}
                  onBlur={()=> setVarRows(prev => prev.map(x => x.id===r.id ? {...x, meterStart: groupVN(x.meterStart)} : x))}
                  style={{borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}
                />
              </View>
            ))}
          </Card>

          {/* Thêm khoản phí khác */}
          <Card>
            <Text style={{color:c.text, fontWeight:'800'}}>Thêm khoản phí khác</Text>
            <Text style={{color:c.subtext, marginTop:6}}>Tên phí</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="VD: Vệ sinh chung"
              placeholderTextColor={c.subtext}
              style={{borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}
            />
            <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}}>
              <Text style={{color:c.text}}>Là phí biến đổi?</Text>
              <Switch value={newIsVar} onValueChange={setNewIsVar}/>
            </View>
            <Text style={{color:c.subtext, marginTop:6}}>Đơn vị</Text>
            <TextInput
              value={newUnit}
              onChangeText={setNewUnit}
              placeholder={newIsVar ? 'kWh / m3 …' : 'tháng'}
              placeholderTextColor={c.subtext}
              style={{borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}
            />
            <Text style={{color:c.subtext, marginTop:6}}>
              {newIsVar ? 'Giá / đơn vị' : 'Giá / kỳ'}
            </Text>
            <TextInput
              keyboardType="numeric"
              value={newPrice}
              onChangeText={t=> setNewPrice(groupVN(t))}
              onBlur={()=> setNewPrice(groupVN(newPrice))}
              style={{borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}
            />
            <View style={{alignItems:'flex-end', marginTop:10}}>
              <Button title="Thêm" onPress={addNewCharge} />
            </View>
          </Card>

          <View style={{flexDirection:'row', justifyContent:'flex-end', gap:10}}>
            <Button title="Huỷ" variant="ghost" onPress={()=> setEditMode(false)} />
            <Button title="Lưu (áp dụng kỳ sau)" onPress={saveNextOnly} />
          </View>
        </View>
      )}
    </View>
  );
}
