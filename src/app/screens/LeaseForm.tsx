import React, {useMemo, useState} from 'react';
import {
  View, Text, TextInput, Switch, Alert, TouchableOpacity, ScrollView, Platform, Modal,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {groupVN, onlyDigits} from '../../utils/number';
import {useCurrency} from '../../utils/currency';
import {startLeaseAdvanced} from '../../services/rent';
import ChargeChooserModal from '../components/ChargeChooserModal';

type Props = NativeStackScreenProps<RootStackParamList, 'LeaseForm'>;

let RNDateTimePicker: any;
try {
  RNDateTimePicker = require('@react-native-community/datetimepicker').default;
} catch { RNDateTimePicker = null; }

export default function LeaseForm({route, navigation}: Props) {
  const {roomId} = route.params as any;
  const c = useThemeColors();
  const {format} = useCurrency();

  // Tenant
  const [tenantName, setTenantName] = useState('');
  const [tenantIdNo, setTenantIdNo] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');

  // Lease config
  const [leaseType, setLeaseType] = useState<'short_term'|'long_term'>('long_term');
  const [billing, setBilling] = useState<'daily'|'monthly'|'yearly'>('monthly');
  const [startDate, setStartDate] = useState(new Date());
  const [openDate, setOpenDate] = useState(false);

  const [duration, setDuration] = useState('');
  const [baseRent, setBaseRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [isAllInclusive, setIsAllInclusive] = useState(false);

  // chọn phí
  const [openCharges, setOpenCharges] = useState(false);  // <-- FIX
  type Picked = {
    name: string;
    is_variable: boolean;
    unit?: string;
    unitPrice?: number;
    meterStart?: number;
    price?: number;
  };
  const [charges, setCharges] = useState<Picked[]>([]);

  // phí khác
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  const billingLabel = useMemo(() => {
    if (billing === 'daily') return 'Số ngày';
    if (billing === 'yearly') return 'Số năm';
    return 'Số tháng';
  }, [billing]);

  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  function onPickCharges(list: Picked[]) { setCharges(list); }
  function addCustom() {
    if (!customName.trim()) return Alert.alert('Nhập tên khoản phí khác');
    const value = Number(onlyDigits(customPrice)) || 0;
    setCharges(prev => [...prev, {name: customName.trim(), is_variable: false, price: value, unit: 'tháng'}]);
    setCustomName(''); setCustomPrice('');
  }

  function save() {
    if (!tenantName.trim()) return Alert.alert('Vui lòng nhập tên người thuê');
    const base = Number(onlyDigits(baseRent)) || 0;
    const dep = Number(onlyDigits(deposit)) || 0;

    const selectedCharges = isAllInclusive ? [] : charges.map(ch => {
      if (ch.is_variable) {
        return {name: ch.name, type: 'variable' as const, unit: ch.unit, unitPrice: ch.unitPrice ?? 0, meterStart: ch.meterStart ?? 0};
      }
      return {name: ch.name, type: 'fixed' as const, unit: ch.unit ?? 'tháng', unitPrice: Number(onlyDigits(String(ch.price ?? 0))) || 0};
    });

    const cfg: any = {
      roomId,
      leaseType,
      billing: leaseType === 'short_term' ? 'daily' : billing,
      startDateISO: ymd(startDate),
      baseRent: base,
      deposit: dep,
      durationDays: leaseType === 'short_term' ? (Number(onlyDigits(duration)) || undefined) : undefined,
      isAllInclusive,
      charges: isAllInclusive ? [] : selectedCharges,
      tenant: { full_name: tenantName.trim(), id_number: tenantIdNo.trim() || undefined, phone: tenantPhone.trim() || undefined },
    };

    startLeaseAdvanced(cfg);
    Alert.alert('Thành công', 'Đã tạo hợp đồng.', [
      {text:'OK', onPress:()=> navigation.replace('RoomDetail', {roomId})},
    ]);
  }

  return (
    <View style={{flex:1, backgroundColor: c.bg}}>
      <Header title="Tạo hợp đồng" />
      <ScrollView contentContainerStyle={{paddingBottom:24}}>
        <Card style={{margin:16, gap:8}}>
          <Text style={{color:c.text, fontWeight:'700'}}>Thông tin người thuê</Text>
          <TextInput placeholder="Tên người thuê" placeholderTextColor={c.subtext} value={tenantName} onChangeText={setTenantName}
            style={{borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}/>
          <TextInput placeholder="Số CCCD/CMND" placeholderTextColor={c.subtext} value={tenantIdNo} onChangeText={setTenantIdNo}
            style={{borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}/>
          <TextInput placeholder="Số điện thoại" placeholderTextColor={c.subtext} keyboardType="phone-pad" value={tenantPhone} onChangeText={setTenantPhone}
            style={{borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}/>
        </Card>

        <Card style={{marginHorizontal:16, gap:10}}>
          <Text style={{color:c.text, fontWeight:'700'}}>Loại hợp đồng</Text>
          <View style={{flexDirection:'row', gap:8}}>
            <Button title="Ngắn hạn" variant={leaseType==='short_term' ? 'primary' : 'ghost'} onPress={()=>{ setLeaseType('short_term'); setBilling('daily'); }}/>
            <Button title="Dài hạn" variant={leaseType==='long_term' ? 'primary' : 'ghost'} onPress={()=> setLeaseType('long_term')}/>
          </View>

          <Text style={{color:c.text, fontWeight:'700'}}>Chu kỳ</Text>
          <View style={{flexDirection:'row', gap:8}}>
            <Button title="Ngày" variant={billing==='daily' ? 'primary' : 'ghost'} onPress={()=> setBilling('daily')}/>
            <Button title="Tháng" variant={billing==='monthly' ? 'primary' : 'ghost'} onPress={()=> setBilling('monthly')}/>
            <Button title="Năm" variant={billing==='yearly' ? 'primary' : 'ghost'} onPress={()=> setBilling('yearly')}/>
          </View>

          <Text style={{color:c.text, marginTop:8}}>Ngày bắt đầu</Text>
          <TouchableOpacity onPress={()=> setOpenDate(true)} style={{borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:12,backgroundColor:c.card}}>
            <Text style={{color:c.text}}>{startDate.toISOString().slice(0,10)}</Text>
          </TouchableOpacity>

          <Text style={{color:c.text, marginTop:8}}>{billingLabel}</Text>
          <TextInput placeholder={billingLabel} placeholderTextColor={c.subtext} keyboardType="numeric" value={duration} onChangeText={setDuration}
            style={{borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}/>

          <Text style={{color:c.text, marginTop:8}}>Giá thuê cơ bản</Text>
          <TextInput placeholder="Giá thuê cơ bản" placeholderTextColor={c.subtext} keyboardType="numeric" value={baseRent}
            onChangeText={t=> setBaseRent(groupVN(t))} onBlur={()=> setBaseRent(groupVN(baseRent))}
            style={{borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}/>

          <Text style={{color:c.text, marginTop:8}}>Tiền cọc</Text>
          <TextInput placeholder="Tiền cọc" placeholderTextColor={c.subtext} keyboardType="numeric" value={deposit}
            onChangeText={t=> setDeposit(groupVN(t))} onBlur={()=> setDeposit(groupVN(deposit))}
            style={{borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}/>

          <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}}>
            <Text style={{color:c.text}}>Bao toàn bộ phí</Text>
            <Switch value={isAllInclusive} onValueChange={setIsAllInclusive}/>
          </View>
        </Card>

        {!isAllInclusive && (
          <Card style={{margin:16, gap:10}}>
            <Button title="Chọn các khoản phí (cố định/không cố định)" variant="ghost" onPress={()=> setOpenCharges(true)}/>
            {charges.length ? (
              <View style={{gap:4}}>
                {charges.map((ch,i)=>(
                  <Text key={i} style={{color:c.subtext}}>
                    • {ch.name}{ch.is_variable ? ` — giá: ${format(Number(ch.unitPrice||0))}/${ch.unit||''}, chỉ số đầu: ${ch.meterStart ?? 0}`
                                               : ` — ${format(Number(ch.price||0))}`}
                  </Text>
                ))}
              </View>
            ) : <Text style={{color:c.subtext}}>Chưa chọn phí nào</Text>}

            <Text style={{color:c.text, fontWeight:'700', marginTop:8}}>Khoản phí khác</Text>
            <View style={{flexDirection:'row', gap:8}}>
              <TextInput placeholder="Tên phí" placeholderTextColor={c.subtext} value={customName} onChangeText={setCustomName}
                style={{flex:1,borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}/>
              <TextInput placeholder="Giá (cố định)" placeholderTextColor={c.subtext} keyboardType="numeric" value={customPrice}
                onChangeText={t=> setCustomPrice(groupVN(t))} onBlur={()=> setCustomPrice(groupVN(customPrice))}
                style={{width:140,borderWidth:1,borderColor:'#2A2F3A',borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}/>
            </View>
            <View style={{alignItems:'flex-end'}}>
              <Button title="Thêm" onPress={addCustom}/>
            </View>
          </Card>
        )}

        <View style={{alignItems:'flex-end', marginHorizontal:16}}>
          <Button title="Lưu" onPress={save}/>
        </View>
      </ScrollView>

      {RNDateTimePicker && (
        <Modal transparent visible={openDate} animationType="fade" onRequestClose={()=> setOpenDate(false)}>
          <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding:16}}>
            <Card>
              <RNDateTimePicker
                mode="date"
                value={startDate}
                onChange={(_:any, d?:Date)=>{ if (Platform.OS==='android') setOpenDate(false); if (d) setStartDate(d); }}
                display={Platform.OS==='ios' ? 'inline' : 'calendar'}
              />
              <View style={{flexDirection:'row', justifyContent:'flex-end', marginTop:8}}>
                <Button title="Đóng" variant="ghost" onPress={()=> setOpenDate(false)}/>
              </View>
            </Card>
          </View>
        </Modal>
      )}

      <ChargeChooserModal
        visible={openCharges}
        onClose={()=> setOpenCharges(false)}
        onConfirm={(list)=> { onPickCharges(list as any); setOpenCharges(false); }}
        initialSelected={charges as any}
      />
    </View>
  );
}
