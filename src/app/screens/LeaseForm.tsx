import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, TouchableOpacity, Platform, Alert, ScrollView} from 'react-native';
import DateTimePicker, {Event} from '@react-native-community/datetimepicker';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {useThemeColors} from '../theme';
import Header from '../components/Header';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import Segmented from '../components/Segmented';
import Toggle from '../components/Toggle';
import {addRecurringCharge, seedChargeCatalogOnce, startLease, updateLeaseEndDate} from '../../services/rent';
import ChargeChooserModal from '../components/ChargeChooserModal';

// helpers định dạng
const onlyDigits = (s: string) => (s || '').replace(/[^\d]/g, '');
const groupVN = (s: string) => {
  const n = onlyDigits(s);
  return n ? Number(n).toLocaleString('vi-VN') : '';
};
const formatVN = (n: number) => n.toLocaleString('vi-VN');

type Props = NativeStackScreenProps<RootStackParamList, 'LeaseForm'>;

export default function LeaseForm({route, navigation}: Props) {
  const {roomId} = route.params;
  const c = useThemeColors();

  // type & billing
  const [leaseType, setLeaseType] = useState<'short_term'|'long_term'>('long_term');
  const [billing, setBilling] = useState<'daily'|'monthly'|'yearly'>('monthly');

  // start date
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const startISO = useMemo(()=> startDate.toISOString().slice(0,10), [startDate]);

  // duration
  const [durationCount, setDurationCount] = useState('');
  const durationLabel = useMemo(()=> (
    billing==='daily' ? 'Số ngày' : billing==='yearly' ? 'Số năm' : 'Số tháng'
  ), [billing]);

  // money
  const [baseRent, setBaseRent] = useState('3.000.000');
  const [deposit, setDeposit] = useState('500.000');

  // all-inclusive
  const [allInc, setAllInc] = useState(false);
  const [allIncAmount, setAllIncAmount] = useState('3.000.000');

  // chọn phí khi không bao phí
  const [pickVisible, setPickVisible] = useState(false);
  const [picked, setPicked] = useState<Array<{charge_type_id:string; is_variable:boolean; unit_price?:number}>>([]);

  // validation flags
  const [errBaseRent, setErrBaseRent] = useState(false);
  const [errAllInc, setErrAllInc] = useState(false);
  const [errDuration, setErrDuration] = useState(false);

  useEffect(()=> { seedChargeCatalogOnce(); }, []);

  const onChangeDate = (_: Event, selected?: Date) => {
    if (Platform.OS === 'android') setPickerOpen(false);
    if (selected) setStartDate(selected);
  };

  function calcEndDateISO(): string | undefined {
    const n = Number(onlyDigits(durationCount)) || 0;
    if (n <= 0) return undefined;
    const s = new Date(startISO);
    const d = new Date(s);
    if (billing === 'daily') { d.setDate(d.getDate() + n - 1); }
    else if (billing === 'monthly') { d.setMonth(d.getMonth() + n); d.setDate(d.getDate()-1); }
    else { d.setFullYear(d.getFullYear() + n); d.setDate(d.getDate()-1); }
    return d.toISOString().slice(0,10);
  }

  const previewRent = useMemo(()=> {
    const v = Number(onlyDigits(allInc ? allIncAmount : baseRent)) || 0;
    return formatVN(v);
  }, [allInc, allIncAmount, baseRent]);

  const trySave = () => {
    setErrBaseRent(false); setErrAllInc(false); setErrDuration(false);

    const baseRentNum = Number(onlyDigits(baseRent));
    const depositNum  = Number(onlyDigits(deposit));
    const allIncNum   = Number(onlyDigits(allIncAmount));
    const durationNum = Number(onlyDigits(durationCount));

    let ok = true;
    if (!baseRentNum) { setErrBaseRent(true); ok = false; }
    if (allInc && !allIncNum) { setErrAllInc(true); ok = false; }
    if (!durationNum) { setErrDuration(true); ok = false; }

    if (!ok) {
      Alert.alert('Thiếu thông tin', 'Vui lòng kiểm tra lại các trường đánh dấu đỏ.');
      return;
    }

    const leaseId = startLease(
      roomId,
      leaseType,
      startISO,
      billing,
      baseRentNum,
      depositNum,
      billing==='daily' ? durationNum : undefined,
      allInc,
      allInc ? allIncNum : undefined
    );

    if ((billing==='monthly' || billing==='yearly') && durationNum>0) {
      const endISO = calcEndDateISO();
      if (endISO) updateLeaseEndDate(leaseId, endISO);
    }

    if (!allInc) {
      for (const p of picked) addRecurringCharge(leaseId, p.charge_type_id, p.unit_price, p.is_variable?1:0);
    }

    Alert.alert('Đã tạo hợp đồng');
    navigation.replace('LeaseDetail', {leaseId});
  };

  return (
    <View style={{flex:1, backgroundColor:c.bg}}>


      <ScrollView contentContainerStyle={{padding:16, gap:12}}>
        <Card style={{gap:12}}>
          <Text style={{fontWeight:'700', color:c.text}}>Loại hợp đồng</Text>
          <Segmented
            value={leaseType}
            onChange={(v)=> setLeaseType(v as any)}
            options={[
              {label:'Ngắn hạn', value:'short_term'},
              {label:'Dài hạn', value:'long_term'},
            ]}
            activeTextColor="#FFFFFF"
          />

          <Text style={{fontWeight:'700', color:c.text}}>Chu kỳ</Text>
          <Segmented
            value={billing}
            onChange={(v)=> setBilling(v as any)}
            options={[
              {label:'Ngày', value:'daily'},
              {label:'Tháng', value:'monthly'},
              {label:'Năm', value:'yearly'},
            ]}
            activeTextColor="#FFFFFF"
          />

          <Text style={{color:c.subtext}}>Ngày bắt đầu</Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={()=> setPickerOpen(true)}
            style={{borderWidth:1, borderColor:'#2A2F3A', backgroundColor:c.card, padding:12, borderRadius:12}}
          >
            <Text style={{color:c.text, fontWeight:'600'}}>{startISO}</Text>
          </TouchableOpacity>
          {pickerOpen && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS==='ios'?'inline':'default'}
              onChange={onChangeDate}
            />
          )}

          <Input
            label={durationLabel}
            keyboardType="numeric"
            value={durationCount}
            onChangeText={(t)=>{ setDurationCount(t); if (errDuration) setErrDuration(false); }}
            onBlur={()=> setDurationCount(groupVN(durationCount))}
            error={errDuration}
            helperText={errDuration ? 'Vui lòng nhập số hợp lệ' : undefined}
          />

          <Input
            label="Giá thuê cơ bản"
            keyboardType="numeric"
            value={baseRent}
            onChangeText={(t)=>{ setBaseRent(t); if (errBaseRent) setErrBaseRent(false); }}
            onBlur={()=> setBaseRent(groupVN(baseRent))}
            error={errBaseRent}
            helperText={errBaseRent ? 'Giá thuê không hợp lệ' : `Xem trước: ${previewRent}`}
          />

          <Input
            label="Tiền cọc"
            keyboardType="numeric"
            value={deposit}
            onChangeText={setDeposit}
            onBlur={()=> setDeposit(groupVN(deposit))}
          />
        </Card>

        <Card style={{gap:12}}>
          <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
            <Text style={{color:c.text, fontWeight:'700'}}>Bao toàn bộ phí</Text>
            <Toggle value={allInc} onChange={setAllInc}/>
          </View>

          {allInc ? (
            <Input
              label="Tổng số tiền phải thu"
              keyboardType="numeric"
              value={allIncAmount}
              onChangeText={(t)=>{ setAllIncAmount(t); if (errAllInc) setErrAllInc(false); }}
              onBlur={()=> setAllIncAmount(groupVN(allIncAmount))}
              error={errAllInc}
              helperText={errAllInc ? 'Số tiền không hợp lệ' : `Xem trước: ${formatVN(Number(onlyDigits(allIncAmount))||0)}`}
            />
          ) : (
            <>
              <Button title="Chọn các khoản phí (cố định/không cố định)" variant="ghost" onPress={()=> setPickVisible(true)} />
              {picked.length>0 && <Text style={{color:c.subtext}}>Đã chọn: {picked.length} khoản</Text>}
            </>
          )}

          <View style={{marginTop:4}}>
            <Text style={{color:c.subtext}}>
              Tạm tính mỗi kỳ: <Text style={{color:c.text, fontWeight:'700'}}>{previewRent}</Text>
            </Text>
          </View>
        </Card>
      </ScrollView>

      {/* Footer actions */}
      <View style={{padding:12, borderTopWidth:1, borderTopColor:'#1F2430', flexDirection:'row', justifyContent:'flex-end', backgroundColor:c.bg}}>
        <Button title="Lưu" onPress={trySave} />
      </View>

      {/* Modal chọn phí */}
      <ChargeChooserModal
        visible={pickVisible}
        onClose={()=> setPickVisible(false)}
        onConfirm={setPicked}
      />
    </View>
  );
}
