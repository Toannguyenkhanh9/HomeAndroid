import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, TextInput, Alert, ScrollView} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {
  getCycle, getLease, getInvoice, listChargesForLease,
  draftInvoiceForCycle, settleCycleWithInputs, updateRecurringChargePrice
} from '../../services/rent';
import {useCurrency} from '../../utils/currency';
import {onlyDigits, groupVN} from '../../utils/number';

type Props = NativeStackScreenProps<RootStackParamList, 'CycleDetail'>;

type RowFixed = {
  kind: 'fixed';
  charge_type_id: string;
  name: string;
  unit?: string|null;
  unit_price: number;
  value: string;
};
type RowVar = {
  kind: 'variable';
  charge_type_id: string;
  name: string;
  unit?: string|null;
  unit_price: number;
  meterStart: number;
  currentValue: string;
};
type ChargeRow = RowFixed | RowVar;

export default function CycleDetail({route}: Props) {
  const {cycleId} = route.params as any;
  const c = useThemeColors();
  const {format} = useCurrency();

  const [leaseId, setLeaseId] = useState<string>('');
  const [baseRent, setBaseRent] = useState<number>(0); // tiền nhà
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [invId, setInvId] = useState<string|undefined>();
  const [invTotal, setInvTotal] = useState<number>(0);
  const [status, setStatus] = useState<string>('open');
  const [period, setPeriod] = useState<{s:string,e:string}>({s:'', e:''});
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    const c0 = getCycle(cycleId);
    if (!c0) return;
    setStatus(String(c0.status));
    setPeriod({s: c0.period_start, e: c0.period_end});

    const l = getLease(c0.lease_id);
    setLeaseId(l.id);
    setBaseRent(Number(l.base_rent || 0));

    const list = listChargesForLease(l.id) as any[];

    const normalized: ChargeRow[] = list.map(it => {
      const isVar = Number(it.is_variable) === 1;
      if (isVar) {
        let start = 0;
        try {
          const cfg = it.config_json ? JSON.parse(it.config_json) : {};
          start = Number(cfg?.meterStart) || 0;
        } catch {}
        return {
          kind: 'variable',
          charge_type_id: it.charge_type_id,
          name: it.name,
          unit: it.unit,
          unit_price: Number(it.unit_price) || 0,
          meterStart: start,
          currentValue: '',
        };
      }
      return {
        kind: 'fixed',
        charge_type_id: it.charge_type_id,
        name: it.name,
        unit: it.unit,
        unit_price: Number(it.unit_price) || 0,
        value: groupVN(String(it.unit_price || 0)),
      };
    });

    setRows(normalized);

    if (c0.invoice_id) {
      setInvId(c0.invoice_id);
      const inv = getInvoice(c0.invoice_id);
      setInvTotal(inv?.total || 0);
    } else {
      setInvId(undefined);
      setInvTotal(0);
    }
  }, [cycleId]);

  // tạm tính (bao gồm tiền nhà)
  const previewTotal = useMemo(() => {
    let sum = baseRent || 0; // cộng tiền nhà
    for (const r of rows) {
      if (r.kind === 'fixed') {
        sum += Number(onlyDigits(r.value)) || 0;
      } else {
        const current = Number(onlyDigits(r.currentValue)) || 0;
        const qty = Math.max(0, current - (r.meterStart || 0));
        sum += qty * (r.unit_price || 0);
      }
    }
    return sum;
  }, [rows, baseRent]);

  // helpers
  const onChangeFixed = (id: string, text: string) =>
    setRows(prev => prev.map(r => (r.kind==='fixed' && r.charge_type_id===id) ? {...r, value:text} : r));
  const onBlurFixed = (id: string) =>
    setRows(prev => prev.map(r => (r.kind==='fixed' && r.charge_type_id===id) ? {...r, value: groupVN(r.value)} : r));
  const onChangeVarNow = (id: string, text: string) =>
    setRows(prev => prev.map(r => (r.kind==='variable' && r.charge_type_id===id) ? {...r, currentValue:text} : r));
  const onBlurVarNow = (id: string) =>
    setRows(prev => prev.map(r => (r.kind==='variable' && r.charge_type_id===id) ? {...r, currentValue: groupVN(r.currentValue)} : r));

  function save(scope:'cycle'|'lease') {
    if (scope === 'lease') {
      // chỉ cập nhật phí cố định của hợp đồng cho kỳ sau
      for (const r of rows) {
        if (r.kind === 'fixed') {
          const newPrice = Number(onlyDigits(r.value)) || 0;
          if (newPrice !== r.unit_price) updateRecurringChargePrice(leaseId, r.charge_type_id, newPrice);
        }
      }
      Alert.alert('Đã lưu', 'Cập nhật áp dụng các chu kỳ sau.');
      setEditMode(false);
      return;
    }

    // cập nhật hóa đơn nháp cho kỳ này (bao gồm điều chỉnh)
    const variables = rows.filter(r=> r.kind==='variable').map(r => {
      const current = Number(onlyDigits((r as RowVar).currentValue)) || 0;
      const qty = Math.max(0, current - ((r as RowVar).meterStart || 0));
      return {charge_type_id: r.charge_type_id, quantity: qty};
    });
    const adjustments: Array<{name:string; amount:number}> = [];
    for (const r of rows) {
      if (r.kind === 'fixed') {
        const newPrice = Number(onlyDigits(r.value)) || 0;
        const delta = newPrice - (r.unit_price || 0);
        if (delta !== 0) adjustments.push({name: `Điều chỉnh ${r.name}`, amount: delta});
      }
    }
    // thêm tiền nhà vào nháp: coi như 1 điều chỉnh “Tiền nhà”
    if (baseRent > 0) adjustments.push({name: 'Tiền nhà', amount: baseRent});

    const inv = draftInvoiceForCycle(cycleId, variables, adjustments);
    setInvId(inv.id);
    setInvTotal(inv.total || 0);
    setEditMode(false);
    Alert.alert('Đã lưu', 'Đã cập nhật hóa đơn nháp.');
  }

  function settleNow() {
    // nếu có phí điện/nước mà chưa nhập chỉ số hiện tại => chuyển sang edit mode cho người dùng nhập
    const needVar = rows.some(r => r.kind==='variable' && !r.currentValue.trim());
    if (needVar) {
      Alert.alert('Thiếu dữ liệu', 'Vui lòng nhập “Chỉ số hiện tại” cho các phí biến đổi trước khi tất toán.');
      setEditMode(true);
      return;
    }

    const variables = rows.filter(r=> r.kind==='variable').map(r => {
      const current = Number(onlyDigits((r as RowVar).currentValue)) || 0;
      const qty = Math.max(0, current - ((r as RowVar).meterStart || 0));
      return {charge_type_id: r.charge_type_id, quantity: qty};
    });
    const adjustments: Array<{name:string; amount:number}> = [];
    for (const r of rows) {
      if (r.kind === 'fixed') {
        const newPrice = Number(onlyDigits(r.value)) || 0;
        const delta = newPrice - (r.unit_price || 0);
        if (delta !== 0) adjustments.push({name: `Điều chỉnh ${r.name}`, amount: delta});
      }
    }
    if (baseRent > 0) adjustments.push({name: 'Tiền nhà', amount: baseRent});

    Alert.alert('Tất toán', 'Bạn có chắc muốn tất toán chu kỳ này?', [
      {text:'Huỷ', style:'cancel'},
      {text:'Đồng ý', onPress: () => {
        const inv = settleCycleWithInputs(cycleId, variables, adjustments);
        setInvId(inv.id);
        setInvTotal(inv.total || 0);
        setStatus('settled');
        setEditMode(false);
        Alert.alert('Hoàn tất', 'Đã tất toán chu kỳ.');
      }},
    ]);
  }

  return (
    <View style={{flex:1, backgroundColor:c.bg}}>
      <Header title="Chu kỳ" />

      {!editMode ? (
        <ScrollView contentContainerStyle={{padding:16, gap:12}}>
          <Card>
            <Text style={{color:c.text}}>Kỳ: {period.s}  →  {period.e}</Text>
            <Text style={{color:c.text}}>Trạng thái: {status}</Text>
            {invId ? <Text style={{color:c.text}}>Hóa đơn: {invId}</Text> : null}
          </Card>

          <Card style={{gap:10}}>
            <Text style={{color:c.text, fontWeight:'800'}}>Các khoản phí</Text>

            {/* Tiền nhà */}
            <View style={{borderWidth:1,borderColor:'#263042',borderRadius:10,padding:10}}>
              <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                <Text style={{color:c.text, fontWeight:'700'}}>Tiền nhà</Text>
                <Text style={{color:c.subtext}}>Cố định</Text>
              </View>
              <Text style={{color:c.subtext, marginTop:6}}>
                Giá kỳ này: <Text style={{color:c.text}}>{format(baseRent)}</Text>
              </Text>
            </View>

            {/* Các phí từ hợp đồng */}
            {rows.map(r => (
              <View key={r.charge_type_id} style={{borderWidth:1,borderColor:'#263042',borderRadius:10,padding:10}}>
                <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                  <Text style={{color:c.text, fontWeight:'700'}}>{r.name}</Text>
                  <Text style={{color:c.subtext}}>
                    {r.kind==='variable' ? `Biến đổi (${r.unit||''})` : 'Cố định'}
                  </Text>
                </View>

                {r.kind==='variable' ? (
                  <>
                    <Text style={{color:c.subtext, marginTop:6}}>
                      Đơn giá: <Text style={{color:c.text}}>{format(r.unit_price)}</Text> / {r.unit||'đv'}
                    </Text>
                    <Text style={{color:c.subtext}}>
                      Chỉ số đầu: <Text style={{color:c.text}}>{(r as RowVar).meterStart ?? 0}</Text>
                    </Text>
                    <Text style={{color:c.subtext}}>
                      Chỉ số hiện tại: — (chưa nhập)
                    </Text>
                  </>
                ) : (
                  <Text style={{color:c.subtext, marginTop:6}}>
                    Giá gốc hợp đồng: <Text style={{color:c.text}}>{format(r.unit_price)}</Text>
                  </Text>
                )}
              </View>
            ))}

            <View style={{marginTop:6}}>
              {invId ? (
                <Text style={{color:c.text, fontWeight:'700'}}>Tổng hoá đơn: {format(invTotal)}</Text>
              ) : (
                <Text style={{color:c.subtext}}>
                  Chưa tất toán — tổng tiền sẽ hiển thị sau khi nhập chỉ số và tất toán.
                </Text>
              )}
            </View>
          </Card>

          <View style={{flexDirection:'row', justifyContent:'flex-end', gap:12}}>
            {status!=='settled' && <Button title="Tất toán" variant="danger" onPress={settleNow} />}
            <Button title="Thay đổi" onPress={()=> setEditMode(true)} />
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{padding:16, gap:12}}>
          <Card>
            <Text style={{color:c.text}}>Kỳ: {period.s}  →  {period.e}</Text>
            <Text style={{color:c.text}}>Trạng thái: {status}</Text>
            {invId ? <Text style={{color:c.text}}>Hóa đơn: {invId}</Text> : null}
          </Card>

          <Card style={{gap:10}}>
            <Text style={{color:c.text, fontWeight:'800'}}>Các khoản phí</Text>

            {/* Tiền nhà (read-only trong edit mode) */}
            <View style={{borderWidth:1,borderColor:'#263042',borderRadius:10,padding:10}}>
              <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                <Text style={{color:c.text, fontWeight:'700'}}>Tiền nhà</Text>
                <Text style={{color:c.subtext}}>Cố định</Text>
              </View>
              <Text style={{color:c.subtext, marginTop:6}}>
                Giá kỳ này: <Text style={{color:c.text}}>{format(baseRent)}</Text>
              </Text>
            </View>

            {rows.map(r => (
              <View key={r.charge_type_id} style={{borderWidth:1,borderColor:'#263042',borderRadius:10,padding:10}}>
                <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                  <Text style={{color:c.text, fontWeight:'700'}}>{r.name}</Text>
                  <Text style={{color:c.subtext}}>
                    {r.kind==='variable' ? `Biến đổi (${r.unit||''})` : 'Cố định'}
                  </Text>
                </View>

                {r.kind==='fixed' ? (
                  <>
                    <View style={{flexDirection:'row', alignItems:'center', gap:8, marginTop:6}}>
                      <Text style={{color:c.subtext, width:110}}>Giá kỳ này</Text>
                      <TextInput
                        keyboardType="numeric"
                        value={(r as RowFixed).value}
                        onChangeText={t=> onChangeFixed(r.charge_type_id, t)}
                        onBlur={()=> onBlurFixed(r.charge_type_id)}
                        style={{flex:1, borderWidth:1, borderColor:'#2A2F3A', borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
                      />
                    </View>
                    <Text style={{color:c.subtext, marginTop:6}}>
                      Giá gốc hợp đồng: <Text style={{color:c.text}}>{format(r.unit_price)}</Text>
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{color:c.subtext, marginTop:6}}>
                      Đơn giá: <Text style={{color:c.text}}>{format(r.unit_price)}</Text> / {r.unit||'đv'}
                    </Text>
                    <Text style={{color:c.subtext}}>
                      Chỉ số đầu: <Text style={{color:c.text}}>{(r as RowVar).meterStart ?? 0}</Text>
                    </Text>
                    <View style={{flexDirection:'row', alignItems:'center', gap:8, marginTop:6}}>
                      <Text style={{color:c.subtext, width:110}}>Chỉ số hiện tại</Text>
                      <TextInput
                        keyboardType="numeric"
                        value={(r as RowVar).currentValue}
                        onChangeText={t=> onChangeVarNow(r.charge_type_id, t)}
                        onBlur={()=> onBlurVarNow(r.charge_type_id)}
                        style={{flex:1, borderWidth:1, borderColor:'#2A2F3A', borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
                      />
                    </View>
                  </>
                )}
              </View>
            ))}

            <View style={{marginTop:6}}>
              <Text style={{color:c.text, fontWeight:'700'}}>Tạm tính theo nhập: {format(previewTotal)}</Text>
              {invId ? <Text style={{color:c.subtext}}>(Hóa đơn hiện tại: {format(invTotal)})</Text> : null}
            </View>
          </Card>

          <View style={{flexDirection:'row', justifyContent:'flex-end', gap:12, flexWrap:'wrap'}}>
            <Button title="Lưu (chu kỳ này)" onPress={()=> save('cycle')} />
            <Button
              title="Lưu (toàn hợp đồng)"
              variant="ghost"
              onPress={()=>{
                Alert.alert('Cập nhật đơn giá', 'Áp dụng cho các chu kỳ sau?', [
                  {text:'Huỷ', style:'cancel'},
                  {text:'Đồng ý', onPress:()=> save('lease')},
                ]);
              }}
            />
            <Button title="Huỷ" variant="ghost" onPress={()=> setEditMode(false)} />
          </View>

          {status!=='settled' && (
            <View style={{marginTop:12, alignItems:'flex-end'}}>
              <Button title="Tất toán" variant="danger" onPress={settleNow} />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
