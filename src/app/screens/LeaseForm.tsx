import React, {useState} from 'react';
import {View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {startLease, upsertChargeType, addRecurringCharge} from '../../services/rent';
import Input from '../components/Input';
import Button from '../components/Button';
import Card from '../components/Card';
import Header from '../components/Header';
import {useThemeColors} from '../theme';

export default function LeaseForm({route, navigation}: NativeStackScreenProps<RootStackParamList, 'LeaseForm'>) {
  const {roomId} = route.params;
  const [leaseType, setLeaseType] = useState<'short_term'|'long_term'>('long_term');
  const [billing, setBilling] = useState<'daily'|'monthly'>('monthly');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0,10));
  const [baseRent, setBaseRent] = useState('3000000');
  const [deposit, setDeposit] = useState('500000');
  const c = useThemeColors();

  return (
    <View style={{flex:1, padding:16, backgroundColor: c.bg}}>
      <Header title="Tạo hợp đồng" />
      <Card>
        <Input placeholder="Loại (short_term/long_term)" value={leaseType} onChangeText={(t)=> setLeaseType(t==='short_term'?'short_term':'long_term')}/>
        <View style={{height:8}}/>
        <Input placeholder="Chu kỳ (daily/monthly)" value={billing} onChangeText={(t)=> setBilling(t==='daily'?'daily':'monthly')}/>
        <View style={{height:8}}/>
        <Input placeholder="Ngày bắt đầu (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate}/>
        <View style={{height:8}}/>
        <Input placeholder="Giá thuê cơ bản" value={baseRent} onChangeText={setBaseRent} keyboardType="numeric"/>
        <View style={{height:8}}/>
        <Input placeholder="Tiền cọc" value={deposit} onChangeText={setDeposit} keyboardType="numeric"/>
        <Button title="Lưu hợp đồng" onPress={() => {
          const leaseId = startLease(roomId, leaseType, startDate, billing, Number(baseRent), Number(deposit)||0);
          const ctRoom = upsertChargeType('Phòng', 'tháng', 'flat', Number(baseRent));
          const ctInternet = upsertChargeType('Internet', 'tháng', 'flat', 120000);
          addRecurringCharge(leaseId, ctRoom);
          addRecurringCharge(leaseId, ctInternet);
          navigation.navigate('InvoiceGenerate', {leaseId});
        }} />
      </Card>
    </View>
  );
}