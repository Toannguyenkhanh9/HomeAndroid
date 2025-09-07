import React, {useEffect, useState} from 'react';
import {View, Text, FlatList} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {getLease, listChargesByLease, listCycles} from '../../services/rent';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {useI18n} from '../../i18n';

export default function LeaseDetail({route, navigation}: NativeStackScreenProps<RootStackParamList, 'LeaseDetail'>) {
  const {leaseId} = route.params;
  const [lease, setLease] = useState<any>();
  const [charges, setCharges] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const c = useThemeColors();
  const {t} = useI18n();

  const reload = () => {
    setLease(getLease(leaseId));
    setCharges(listChargesByLease(leaseId));
    setCycles(listCycles(leaseId));
  };
  useEffect(reload, [leaseId]);

  return (
    <View style={{flex:1, padding:16, backgroundColor:c.bg}}>
      <Header title={t('leaseDetail')} />
      {lease && (
        <Card>
          <Text style={{color:c.text}}>{t('startDate')}: {lease.start_date}</Text>
          {lease.end_date ? <Text style={{color:c.text}}>{t('endDate')}: {lease.end_date}</Text> : null}
          <Text style={{color:c.text}}>{t('status')}: {lease.status}</Text>
        </Card>
      )}

      <Card>
        <Text style={{color:c.text, fontWeight:'700'}}>{t('charges')}</Text>
        <FlatList
          data={charges}
          keyExtractor={(i)=>i.id}
          renderItem={({item})=>(
            <View style={{flexDirection:'row', justifyContent:'space-between', marginVertical:6}}>
              <Text style={{color:c.text}}>{item.name} {item.is_variable?`(${t('variable')})`:`(${t('fixed')})`}</Text>
              <Text style={{color:c.text}}>{item.unit_price ?? 0}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={{color:c.subtext}}>—</Text>}
        />
        <Button title={t('addCharge')} variant="ghost" onPress={()=>{/* mở modal chọn phí */}} />
      </Card>

      <Card>
        <Text style={{color:c.text, fontWeight:'700'}}>{t('cycles')}</Text>
        <FlatList
          data={cycles}
          keyExtractor={(i)=>i.id}
          renderItem={({item})=>(
            <View style={{flexDirection:'row', justifyContent:'space-between', marginVertical:6}}>
              <Text style={{color:c.text}}>{item.period_start} → {item.period_end}</Text>
              <Button title={item.status==='settled'? t('paid'): t('unpaid')}
                variant={item.status==='settled'?'ghost':'primary'}
                onPress={()=>navigation.navigate('CycleDetail', {cycleId: item.id})}/>
            </View>
          )}
        />
      </Card>
    </View>
  );
}
