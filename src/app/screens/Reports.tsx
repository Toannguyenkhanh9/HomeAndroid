import React, {useState} from 'react';
import {View, Text} from 'react-native';
import {revenueByMonth} from '../../services/report';
import {formatMoney} from '../../utils/currency';
import Input from '../components/Input';
import Button from '../components/Button';
import Card from '../components/Card';
import Header from '../components/Header';
import {useThemeColors} from '../theme';
import {useUIStore} from '../store/ui';

export default function Reports() {
  const now = new Date();
  const [y, setY] = useState(String(now.getFullYear()));
  const [m, setM] = useState(String(now.getMonth()+1));
  const [rev, setRev] = useState<number|undefined>();
  const c = useThemeColors();
  const currency = useUIStore(s=>s.currency);

  return (
    <View style={{flex:1, padding:16, backgroundColor: c.bg}}>
      <Header title="Báo cáo" />
      <Card>
        <Input value={y} onChangeText={setY} keyboardType="numeric" placeholder="Năm"/>
        <View style={{height:8}}/>
        <Input value={m} onChangeText={setM} keyboardType="numeric" placeholder="Tháng"/>
        <Button title="Tính" onPress={()=> setRev(revenueByMonth(Number(y), Number(m)))} />
        {rev !== undefined && (
          <Text style={{marginTop:8, color: c.text}}>Doanh thu: {formatMoney(rev, currency)}</Text>
        )}
      </Card>
    </View>
  );
}