// src/app/screens/OperatingCostSettings.tsx
import React, {useEffect, useState, useCallback, memo} from 'react';
import {View, Text, ScrollView, Alert, KeyboardAvoidingView,Platform} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Card from '../components/Card';
import Button from '../components/Button';
import FormInput from '../components/FormInput';
import {useThemeColors} from '../theme';
import { formatDecimalTypingVNStrict, parseDecimalCommaStrict, formatNumber as groupVN } from '../../utils/number';
import {listOperatingCostTemplates, replaceOperatingCostTemplates} from '../../services/rent';
import {useTranslation} from 'react-i18next';

type Props = NativeStackScreenProps<RootStackParamList, 'OperatingCostSettings'>;
type Row = {name:string; isVariable:boolean; defaultAmount?:string};

export default function OperatingCostSettings({route, navigation}: Props) {
  const {apartmentId} = route.params as any;
  const c = useThemeColors();
  const {t} = useTranslation();

  const [fixedRows, setFixedRows] = useState<Row[]>([]);
  const [varRows, setVarRows] = useState<Row[]>([]);

  useEffect(() => {
    const data = listOperatingCostTemplates(apartmentId);
    const f: Row[] = [];
    const v: Row[] = [];
    for (const t of data) {
      if (Number(t.is_variable) === 1) {
        v.push({name: t.name, isVariable: true, defaultAmount: ''});
      } else {
        f.push({
          name: t.name,
          isVariable: false,
          defaultAmount: groupVN(String(t.default_amount||0)),
        });
      }
    }
    setFixedRows(f.length ? f : [
      {name: t('operatingCostSettings.houserent'), isVariable:false, defaultAmount:''},
      {name:t('operatingCostSettings.internet'), isVariable:false, defaultAmount:''},
      {name:t('operatingCostSettings.garbage'), isVariable:false, defaultAmount:''},
      {name: t('operatingCostSettings.employeecost'), isVariable:false, defaultAmount:''},
    ]);
    setVarRows(v.length ? v : [
      {name:t('rent.electricity'), isVariable:true, defaultAmount:''},
      {name:t('rent.water'), isVariable:true, defaultAmount:''},
    ]);
  }, [apartmentId]);

  const setFixedAt = useCallback((idx:number, patch:Partial<Row>) => {
    setFixedRows(prev => {
      const copy = [...prev];
      copy[idx] = {...copy[idx], ...patch};
      return copy;
    });
  }, []);
  const removeFixedAt = useCallback((idx:number) => {
    setFixedRows(prev => prev.filter((_,i)=>i!==idx));
  }, []);
  const setVarAt = useCallback((idx:number, patch:Partial<Row>) => {
    setVarRows(prev => {
      const copy = [...prev];
      copy[idx] = {...copy[idx], ...patch};
      return copy;
    });
  }, []);
  const removeVarAt = useCallback((idx:number) => {
    setVarRows(prev => prev.filter((_,i)=>i!==idx));
  }, []);

  const save = () => {
    const payload = [
      ...fixedRows.filter(x => x.name.trim()).map(x => ({
        name: x.name.trim(),
        isVariable: false,
        unit: null,
        defaultAmount: Number(parseDecimalCommaStrict(x.defaultAmount||''))||0,
      })),
      ...varRows.filter(x => x.name.trim()).map(x => ({
        name: x.name.trim(),
        isVariable: true,
        unit: null,
        defaultAmount: 0,
      })),
    ];
    replaceOperatingCostTemplates(apartmentId, payload);
    Alert.alert(t('operatingCostSettings.saved'), t('operatingCostSettings.savedMsg'), [
      {text:'OK', onPress: () => navigation.goBack()},
    ]);
  };

  return (
   <KeyboardAvoidingView
     style={{ flex: 1 }}
     behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
   >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{padding:12, gap:12}}
        showsVerticalScrollIndicator
      >
        <Card style={{gap:10}}>
          <Text style={{color:c.text, fontWeight:'800'}}>{t('operatingCostSettings.fixedCosts')}</Text>
          {fixedRows.map((r, idx)=>(
            <FixedRowItem
              key={`f-${idx}`}
              c={c}
              row={r}
              onChangeName={(t)=>setFixedAt(idx,{name:t})}
              onChangeAmount={(t)=>setFixedAt(idx,{defaultAmount: formatDecimalTypingVNStrict(t)})}
              onRemove={()=>removeFixedAt(idx)}
            />
          ))}
          <Button title={t('operatingCostSettings.addFixed')} variant="ghost"
            onPress={()=>setFixedRows(arr=>[...arr, {name:'', isVariable:false, defaultAmount:''}])}/>
        </Card>

        <Card style={{gap:10}}>
          <Text style={{color:c.text, fontWeight:'800'}}>{t('operatingCostSettings.variableCosts')}</Text>
          {varRows.map((r, idx)=>(
            <VarRowItem
              key={`v-${idx}`}
              c={c}
              row={r}
              onChangeName={(t)=>setVarAt(idx,{name:t})}
              onRemove={()=>removeVarAt(idx)}
            />
          ))}
          <Button title={t('operatingCostSettings.addVariable')} variant="ghost"
            onPress={()=>setVarRows(arr=>[...arr, {name:'', isVariable:true, defaultAmount:''}])}/>
        </Card>

        <View style={{flexDirection:'row', justifyContent:'flex-end', gap:10}}>
          <Button title={t('operatingCostSettings.save')} onPress={save}/>
        </View>
      </ScrollView>
   </KeyboardAvoidingView>
  );
}

/* ===== Components ===== */

const FixedRowItem = memo(function FixedRowItem({
  c,
  row,
  onChangeName,
  onChangeAmount,
  onRemove,
}: {
  c: ReturnType<typeof useThemeColors>;
  row: Row;
  onChangeName: (t:string)=>void;
  onChangeAmount: (t:string)=>void;
  onRemove: ()=>void;
}) {
  const {t} = useTranslation();
  return (
    <View style={{ borderRadius:10, padding:10, gap:8}}>
      <FormInput
        placeholder={t('operatingCostSettings.namePlaceholder')}
        value={row.name ?? ''}
        onChangeText={onChangeName}
      />
      <FormInput
        placeholder={t('operatingCostSettings.defaultAmount')}
        keyboardType="decimal-pad"
        value={row.defaultAmount ?? ''}
        onChangeText={onChangeAmount}
      />
      <Button title={t('operatingCostSettings.delete')} variant="ghost" onPress={onRemove}/>
    </View>
  );
});

const VarRowItem = memo(function VarRowItem({
  c,
  row,
  onChangeName,
  onRemove,
}: {
  c: ReturnType<typeof useThemeColors>;
  row: Row;
  onChangeName: (t:string)=>void;
  onRemove: ()=>void;
}) {
  const {t} = useTranslation();
  return (
  <KeyboardAvoidingView
    style={{ flex: 1 }}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  >
      <FormInput
        placeholder={t('operatingCostSettings.variableNamePlaceholder')}
        value={row.name ?? ''}
        onChangeText={onChangeName}
      />
      <Button title={t('operatingCostSettings.delete')} variant="ghost" onPress={onRemove}/>
   </KeyboardAvoidingView>
  );
});
