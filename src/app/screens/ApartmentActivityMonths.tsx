import React, {useEffect, useState} from 'react';
import {View, Text, FlatList} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {listMonthsWithActivity} from '../../services/activities';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';

export default function ApartmentActivityMonths({route, navigation}: NativeStackScreenProps<RootStackParamList, 'ApartmentActivityMonths'>) {
  const {apartmentId} = route.params;
  const [months, setMonths] = useState<Array<{year:number;month:number;ym:string}>>([]);
  const c = useThemeColors();

  useEffect(()=>{ setMonths(listMonthsWithActivity(apartmentId)); }, [apartmentId]);

  const now = new Date();
  const curYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  return (
    <View style={{flex:1, padding:16, backgroundColor: c.bg}}>
      <Header title="Lịch sử hoạt động" />
      <Card>
        <Button title="Xem tháng hiện tại" onPress={()=> navigation.navigate('ApartmentActivityDetail', {apartmentId, year: now.getFullYear(), month: now.getMonth()+1})} />
      </Card>
      <FlatList
        data={months}
        keyExtractor={(i)=>i.ym}
        renderItem={({item})=> (
          <Card>
            <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
              <Text style={{color:c.text, fontWeight: item.ym===curYM? '700':'500'}}>{item.ym}</Text>
              <Button title="Xem" variant="ghost" onPress={()=> navigation.navigate('ApartmentActivityDetail', {apartmentId, year:item.year, month:item.month})} />
            </View>
          </Card>
        )}
        ListEmptyComponent={<Text style={{color:c.text, opacity:0.7, textAlign:'center', marginTop:12}}>Chưa có dữ liệu. Hãy tạo hóa đơn hoặc thêm chi phí.</Text>}
      />
    </View>
  );
}
