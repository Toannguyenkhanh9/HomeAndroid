import React, {useState} from 'react';
import {View, Text} from 'react-native';
import {revenueByMonth} from '../../services/report';
import {formatVND} from '../../utils/currency';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import {useThemeColors} from '../theme';
import {useI18n} from '../../i18n';
import {useCurrency} from '../../utils/currency';

export default function Reports() {
  const now = new Date();
  const [y, setY] = useState(String(now.getFullYear()));
  const [m, setM] = useState(String(now.getMonth()+1));
  const [rev, setRev] = useState<number|undefined>();
  const c = useThemeColors();
  const {t} = useI18n();
  const {format} = useCurrency();
  return (
    <View style={{flex:1, padding:16, backgroundColor:c.bg}}>
      <Header title={t('reportsTitle')} />
      <Card>
        <Input placeholder={t('year')} value={y} onChangeText={setY} keyboardType="numeric" />
        <View style={{height:8}}/>
        <Input placeholder={t('month')} value={m} onChangeText={setM} keyboardType="numeric" />
        <View style={{height:8}}/>
        <Button title={t('compute')} onPress={()=> setRev(revenueByMonth(Number(y), Number(m)))} />
      </Card>
      {rev !== undefined && (
        <Card>
          <Text style={{color:c.text}}>{t('revenue')}: {format(rev)} đ</Text>
        </Card>
      )}
    </View>
  );
}
