import React, {useState} from 'react';
import {View, Text} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {generateInvoice, addMeterReading, upsertChargeType} from '../../services/rent';
import {query} from '../../db';
import Input from '../components/Input';
import Button from '../components/Button';
import Card from '../components/Card';
import Header from '../components/Header';
import {useThemeColors} from '../theme';

export default function InvoiceGenerate({route, navigation}: NativeStackScreenProps<RootStackParamList, 'InvoiceGenerate'>) {
  const {leaseId} = route.params;
  const [from, setFrom] = useState('2025-09-01');
  const [to, setTo] = useState('2025-09-30');
  const [elecStart, setElecStart] = useState('1000');
  const [elecEnd, setElecEnd] = useState('1120');
  const [waterStart, setWaterStart] = useState('10');
  const [waterEnd, setWaterEnd] = useState('15');
  const c = useThemeColors();

  function queryCT(name: string) {
    const r = query<{id:string}>(`SELECT id FROM charge_types WHERE name = ? LIMIT 1`, [name]);
    return r[0];
  }

  return (
    <View style={{flex:1, padding:16, backgroundColor: c.bg}}>
      <Header title="Tạo hóa đơn" />
      <Card>
        <Text style={{color:c.subtext}}>Kỳ từ</Text>
        <Input value={from} onChangeText={setFrom}/>
        <View style={{height:8}}/>
        <Text style={{color:c.subtext}}>đến</Text>
        <Input value={to} onChangeText={setTo}/>
        <View style={{height:12}}/>
        <Text style={{color:c.subtext}}>Điện: chỉ số đầu/cuối</Text>
        <View style={{flexDirection:'row', gap:8}}>
          <View style={{flex:1}}><Input value={elecStart} onChangeText={setElecStart} keyboardType="numeric"/></View>
          <View style={{flex:1}}><Input value={elecEnd} onChangeText={setElecEnd} keyboardType="numeric"/></View>
        </View>
        <View style={{height:8}}/>
        <Text style={{color:c.subtext}}>Nước: chỉ số đầu/cuối</Text>
        <View style={{flexDirection:'row', gap:8}}>
          <View style={{flex:1}}><Input value={waterStart} onChangeText={setWaterStart} keyboardType="numeric"/></View>
          <View style={{flex:1}}><Input value={waterEnd} onChangeText={setWaterEnd} keyboardType="numeric"/></View>
        </View>
        <Button title="Tạo hóa đơn" onPress={() => {
          const ctElectric = queryCT('Điện') ?? (()=> { upsertChargeType('Điện','kWh','per_unit',3500); return queryCT('Điện'); })();
          const ctWater = queryCT('Nước') ?? (()=> { upsertChargeType('Nước','m3','per_unit',9000); return queryCT('Nước'); })();
          addMeterReading(leaseId, ctElectric!.id, from, to, Number(elecStart), Number(elecEnd));
          addMeterReading(leaseId, ctWater!.id, from, to, Number(waterStart), Number(waterEnd));
          const inv = generateInvoice(leaseId, from, to);
          navigation.replace('InvoiceDetail', {invoiceId: inv.invoiceId});
        }} />
      </Card>
    </View>
  );
}