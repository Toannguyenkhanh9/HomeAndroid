// src/app/screens/OperatingCostMonth.tsx
import React, {useEffect, useState, useMemo} from 'react';
import {View, Text, ScrollView, TextInput, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {getOperatingMonth, saveOperatingMonth} from '../../services/rent';
import {useCurrency} from '../../utils/currency';
import {groupVN, onlyDigits} from '../../utils/number';
import {useTranslation} from 'react-i18next';

type Props = NativeStackScreenProps<RootStackParamList, 'OperatingCostMonth'>;

type Row = {
  id?: string | null;
  name: string;
  is_variable: number;
  amount: string;
  ad_hoc?: boolean;
};

export default function OperatingCostMonth({route, navigation}: Props) {
  const {apartmentId, ym} = route.params as any;
  const c = useThemeColors();
  const {format} = useCurrency();
  const {t} = useTranslation();

  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const {items} = getOperatingMonth(apartmentId, ym);
    setRows(
      (items || []).map((i: any) => ({
        id: i.id,
        name: i.name,
        is_variable: Number(i.is_variable) || 0,
        amount: i.amount == null ? '' : groupVN(String(i.amount)),
        ad_hoc: !!i.ad_hoc,
      })),
    );
    setLoaded(true);
  }, [apartmentId, ym]);

  const setAmountFmt = (idx: number, typed: string) => {
    const raw = onlyDigits(typed);
    const formatted = raw === '' ? '' : groupVN(String(Number(raw)));
    setRows(arr => arr.map((x, i) => (i === idx ? {...x, amount: formatted} : x)));
  };

  const updateName = (idx: number, name: string) =>
    setRows(arr => arr.map((x, i) => (i === idx ? {...x, name} : x)));

  const removeRow = (idx: number) => {
    const it = rows[idx];
    Alert.alert(
      t('operatingCostMonth.deleteTitle'),
      t('operatingCostMonth.deleteConfirm', {name: it?.name || t('operatingCostMonth.expense'), ym}),
      [
        {text: t('common.cancel')},
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => setRows(arr => arr.filter((_, i) => i !== idx)),
        },
      ],
    );
  };

  const addAdHocRow = () =>
    setRows(arr => [
      ...arr,
      {
        id: null,
        name: '',
        is_variable: 1,
        amount: '',
        ad_hoc: true,
      },
    ]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + (Number(onlyDigits(r.amount || '')) || 0), 0),
    [rows],
  );

  const save = () => {
    const invalid = rows.find(r => r.ad_hoc && (!r.name.trim() || !(Number(onlyDigits(r.amount || '')) > 0)));
    if (invalid) {
      Alert.alert(t('common.missing'), t('operatingCostMonth.missingInfo'), [{text: t('common.ok')}]);
      return;
    }

    const payload = rows.map(r => ({
      id: r.id ?? null,
      name: (r.name || '').trim(),
      is_variable: Number(r.is_variable) || 0,
      unit: null,
      amount: Number(onlyDigits(r.amount || '')) || 0,
      ad_hoc: r.ad_hoc ? 1 : 0,
    }));

    saveOperatingMonth(apartmentId, ym, payload);
    Alert.alert(t('common.saved'), t('operatingCostMonth.saved'), [
      {text: t('common.ok'), onPress: () => navigation.goBack()},
    ]);
  };

  if (!loaded) {
    return (
      <View style={{flex: 1, backgroundColor: 'transparent'}}>
        <Header title={t('operatingCostMonth.title', {ym})} />
      </View>
    );
  }

  return (
    <View style={{flex: 1, backgroundColor: 'transparent'}}>
      <Header title={t('operatingCostMonth.title', {ym})} />
      <ScrollView contentContainerStyle={{padding: 12, gap: 12}}>
        <Card style={{gap: 10}}>
          <Text style={{color: c.text, fontWeight: '800'}}>{t('operatingCostMonth.expenses')}</Text>

          {rows.map((r, idx) => (
            <View key={(r.id ?? 'new') + '-' + idx} style={{borderRadius: 10, padding: 10, gap: 8}}>
              <Text style={{color: c.text, fontWeight: '700'}}>
                {r.name || '—'}{' '}
                {r.ad_hoc
                  ? t('operatingCostMonth.tagAdhoc')
                  : Number(r.is_variable) === 1
                  ? t('operatingCostMonth.tagVariable')
                  : t('operatingCostMonth.tagFixed')}
              </Text>

              <TextInput
                placeholder={t('operatingCostMonth.expenseName')}
                placeholderTextColor={c.subtext}
                value={r.name}
                onChangeText={t => updateName(idx, t)}
                style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
              />

              <TextInput
                keyboardType="numeric"
                value={r.amount}
                onChangeText={t => setAmountFmt(idx, t)}
                placeholder={t('operatingCostMonth.expenseAmount')}
                placeholderTextColor={c.subtext}
                style={{
                  borderRadius: 10,
                  padding: 10,
                  color: c.text,
                  backgroundColor: c.card,
                }}
              />

              <View style={{alignItems: 'flex-end'}}>
                <Button title={t('operatingCostMonth.deleteThisMonth')} variant="ghost" onPress={() => removeRow(idx)} />
              </View>
            </View>
          ))}

          <View style={{alignItems: 'flex-start'}}>
            <Button title={t('operatingCostMonth.addExpense')} variant="ghost" onPress={addAdHocRow} />
          </View>
        </Card>

        <Card>
          <Text style={{color: c.text, fontWeight: '700'}}>
            {t('operatingCostMonth.total')}: {format(total)}
          </Text>
        </Card>

        <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 10}}>
          <Button title={t('common.save')} onPress={save} />
        </View>
      </ScrollView>
    </View>
  );
}
