// src/app/screens/OperatingCosts.tsx
import React, {useEffect, useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {
  hasOperatingCostSetup,
  listOperatingCostMonths,
  ensureOperatingCostMonth,
  monthLabel,
} from '../../services/rent';

type Props = NativeStackScreenProps<RootStackParamList, 'OperatingCosts'>;

export default function OperatingCosts({route, navigation}: Props) {
  const {apartmentId} = route.params as any;
  const c = useThemeColors();

  const [ready, setReady] = useState(false);
  const [months, setMonths] = useState<any[]>([]);
  const [isSetup, setIsSetup] = useState(false);

  const reload = () => {
    const ok = hasOperatingCostSetup(apartmentId);
    setIsSetup(ok);
    setMonths(ok ? (listOperatingCostMonths(apartmentId) || []) : []);
    setReady(true);
  };

  useEffect(reload, [apartmentId]);

  const addCurrentMonth = () => {
    const ym = monthLabel(new Date());
    ensureOperatingCostMonth(apartmentId, ym);
    reload();
  };

  return (
    <View style={{flex:1, backgroundColor:c.bg}}>
      {!ready ? null : !isSetup ? (
        <ScrollView contentContainerStyle={{padding:12, gap:12}}>
          <Card style={{gap:8}}>
            <Text style={{color:c.text}}>
              Bạn chưa cài đặt danh mục chi phí cho căn hộ này.
            </Text>
            <Button
              title="Cài đặt chi phí"
              onPress={()=>navigation.navigate('OperatingCostSettings', {apartmentId})}
            />
          </Card>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{padding:12, gap:12}}>
          <Card style={{gap:8}}>
            <Text style={{color:c.text, fontWeight:'800'}}>Danh sách tháng (YYYY-MM)</Text>
            {months.length === 0 && (
              <Text style={{color:c.subtext}}>Chưa có dữ liệu. Nhấn “+ Tháng hiện tại”.</Text>
            )}
            {months.map(m => (
              <TouchableOpacity
                key={m.id}
                activeOpacity={0.7}
                onPress={()=>navigation.navigate('OperatingCostMonth', {apartmentId, ym: m.ym})}
              >
                <View style={{borderWidth:1,borderColor:'#263042', borderRadius:10, padding:10, marginTop:8}}>
                  <Text style={{color:c.text, fontWeight:'700'}}>{m.ym}</Text>
                  <Text style={{color:c.subtext}}>Nhấn để xem/nhập chi phí</Text>
                </View>
              </TouchableOpacity>
            ))}
            <View style={{flexDirection:'row', gap:10, marginTop:8}}>
              <Button title="+ Tháng hiện tại" onPress={addCurrentMonth}/>
              <Button
                title="Cài đặt chi phí"
                variant="ghost"
                onPress={()=>navigation.navigate('OperatingCostSettings', {apartmentId})}
              />
            </View>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
