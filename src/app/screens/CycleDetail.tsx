import React, {useEffect, useState} from 'react';
import {View, Text, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {getCycle, openInvoiceForCycle, getLease, settleCycleWithInputs} from '../../services/rent';
import VariableFeesModal from '../components/VariableFeesModal';

export default function CycleDetail({route, navigation}: NativeStackScreenProps<RootStackParamList, 'CycleDetail'>) {
  const {cycleId} = route.params;
  const c = useThemeColors();
  const [cycle, setCycle] = useState<any>();
  const [lease, setLease] = useState<any>();
  const [varVisible, setVarVisible] = useState(false);

  const reload = () => {
    const cy = getCycle(cycleId);
    setCycle(cy);
    setLease(cy ? getLease(cy.lease_id) : undefined);
  };
  useEffect(reload, [cycleId]);

  if (!cycle) return null;

  return (
    <View style={{flex:1, padding:16, backgroundColor:c.bg}}>
      <Header title="Chi tiết chu kỳ" />
      <Card>
        <Text style={{color:c.text}}>Kỳ: {cycle.period_start} → {cycle.period_end}</Text>
        <Text style={{color:c.text}}>Trạng thái: {cycle.status}</Text>
        <Text style={{color:c.text}}>Hóa đơn: {cycle.invoice_id || '—'}</Text>
      </Card>

      {cycle.status !== 'settled' && (
        <Button title="Thanh toán" onPress={()=> setVarVisible(true)} />
      )}

      <VariableFeesModal
        visible={varVisible}
        leaseId={lease?.id}
        onClose={()=> setVarVisible(false)}
        onSubmit={(variables, extras)=>{
          try {
            const inv = openInvoiceForCycle(cycle.id);
            settleCycleWithInputs(cycle.id, variables, extras);
            Alert.alert('OK', 'Đã chốt kỳ và tạo hóa đơn');
            reload();
            navigation.navigate('InvoiceDetail', {invoiceId: inv.id});
          } catch(e:any) {
            Alert.alert('Lỗi', e?.message || 'Không thể thanh toán');
          }
        }}
      />
    </View>
  );
}
