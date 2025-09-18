// src/app/screens/OperatingCosts.tsx
import React, {useEffect, useState, useCallback} from 'react';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
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
import {useTranslation} from 'react-i18next';

type Props = NativeStackScreenProps<RootStackParamList, 'OperatingCosts'>;

export default function OperatingCosts({route, navigation}: Props) {
  const {apartmentId} = route.params as any;
  const c = useThemeColors();
  const {t} = useTranslation();

  const [ready, setReady] = useState(false);
  const [months, setMonths] = useState<any[]>([]);
  const [isSetup, setIsSetup] = useState(false);

  const reload = useCallback(() => {
    const ok = hasOperatingCostSetup(apartmentId);
    setIsSetup(ok);
    setMonths(ok ? (listOperatingCostMonths(apartmentId) || []) : []);
    setReady(true);
  }, [apartmentId]);

  useEffect(() => { reload(); }, [reload]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const addCurrentMonth = () => {
    const ym = monthLabel(new Date());
    ensureOperatingCostMonth(apartmentId, ym);
    reload();
  };

  return (
    <View style={{flex:1, backgroundColor:'transparent'}}>
      {!ready ? null : !isSetup ? (
        <ScrollView contentContainerStyle={{padding:12, gap:12}}>
          <Card style={{gap:8}}>
            <Text style={{color:c.text}}>
              {t('operatingCosts.noSetup')}
            </Text>
            <Button
              title={t('operatingCosts.setupCosts')}
              onPress={() => navigation.navigate('OperatingCostSettings', {apartmentId})}
            />
          </Card>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{padding:12, gap:12}}>
          <Card style={{gap:8}}>
            <Text style={{color:c.text, fontWeight:'800'}}>
              {t('operatingCosts.monthList')}
            </Text>
            {months.length === 0 && (
              <Text style={{color:c.subtext}}>
                {t('operatingCosts.noData')}
              </Text>
            )}
            {months.map(m => (
              <TouchableOpacity
                key={m.id}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('OperatingCostMonth', {apartmentId, ym: m.ym})}
              >
                <View style={{ borderRadius:10, padding:10, marginTop:8}}>
                  <Text style={{color:c.text, fontWeight:'700'}}>{m.ym}</Text>
                  <Text style={{color:c.subtext}}>
                    {t('operatingCosts.tapToView')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            <View style={{flexDirection:'row', gap:10, marginTop:8}}>
              <Button title={t('operatingCosts.addCurrentMonth')} onPress={addCurrentMonth}/>
              <Button
                title={t('operatingCosts.setupCosts')}
                variant="ghost"
                onPress={() => navigation.navigate('OperatingCostSettings', {apartmentId})}
              />
            </View>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
