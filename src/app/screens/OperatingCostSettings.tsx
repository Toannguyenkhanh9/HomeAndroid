// src/app/screens/OperatingCostSettings.tsx
import React, {useEffect, useState, useCallback, memo} from 'react';
import {View, Text, ScrollView, TextInput, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import { formatNumber as groupVN, onlyDigits } from '../../utils/number';
import {listOperatingCostTemplates, replaceOperatingCostTemplates} from '../../services/rent';

type Props = NativeStackScreenProps<RootStackParamList, 'OperatingCostSettings'>;
type Row = {name:string; isVariable:boolean; defaultAmount?:string};

// === Format ngay khi gõ ===
function formatTyping(s: string) {
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString(undefined); // dùng locale hệ thống/app
}

export default function OperatingCostSettings({route, navigation}: Props) {
  const {apartmentId} = route.params as any;
  const c = useThemeColors();

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
        f.push({name: t.name, isVariable: false, defaultAmount: groupVN(String(t.default_amount||0))});
      }
    }
    setFixedRows(f.length ? f : [
      {name:'Tiền thuê nhà', isVariable:false, defaultAmount:''},
      {name:'Internet', isVariable:false, defaultAmount:''},
      {name:'Rác', isVariable:false, defaultAmount:''},
      {name:'Lương nhân viên', isVariable:false, defaultAmount:''},
    ]);
    setVarRows(v.length ? v : [
      {name:'Điện', isVariable:true, defaultAmount:''},
      {name:'Nước', isVariable:true, defaultAmount:''},
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
        defaultAmount: Number(onlyDigits(x.defaultAmount||''))||0,
      })),
      ...varRows.filter(x => x.name.trim()).map(x => ({
        name: x.name.trim(),
        isVariable: true,
        unit: null,
        defaultAmount: 0,
      })),
    ];
    replaceOperatingCostTemplates(apartmentId, payload);
    Alert.alert('Đã lưu', 'Cấu hình chi phí đã được cập nhật.', [
      {text:'OK', onPress: () => navigation.goBack()},
    ]);
  };

  return (
    <View style={{flex:1, backgroundColor:'transparent'}}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{padding:12, gap:12}}
        showsVerticalScrollIndicator
      >
        <Card style={{gap:10}}>
          <Text style={{color:c.text, fontWeight:'800'}}>Chi phí CỐ ĐỊNH</Text>
          {fixedRows.map((r, idx)=>(
            <FixedRowItem
              key={`f-${idx}`}
              c={c}
              row={r}
              onChangeName={(t)=>setFixedAt(idx,{name:t})}
              onChangeAmount={(t)=>setFixedAt(idx,{defaultAmount: formatTyping(t)})}
              onRemove={()=>removeFixedAt(idx)}
            />
          ))}
          <Button title="+ Thêm khoản cố định" variant="ghost"
            onPress={()=>setFixedRows(arr=>[...arr, {name:'', isVariable:false, defaultAmount:''}])}/>
        </Card>

        <Card style={{gap:10}}>
          <Text style={{color:c.text, fontWeight:'800'}}>Chi phí KHÔNG cố định</Text>
          {varRows.map((r, idx)=>(
            <VarRowItem
              key={`v-${idx}`}
              c={c}
              row={r}
              onChangeName={(t)=>setVarAt(idx,{name:t})}
              onRemove={()=>removeVarAt(idx)}
            />
          ))}
          <Button title="+ Thêm khoản không cố định" variant="ghost"
            onPress={()=>setVarRows(arr=>[...arr, {name:'', isVariable:true, defaultAmount:''}])}/>
        </Card>

        <View style={{flexDirection:'row', justifyContent:'flex-end', gap:10}}>
          <Button title="Lưu" onPress={save}/>
        </View>
      </ScrollView>
    </View>
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
  return (
    <View style={{ borderRadius:10, padding:10, gap:8}}>
      <TextInput
        placeholder="Tên khoản chi"
        placeholderTextColor={c.subtext}
        value={row.name ?? ''}
        onChangeText={onChangeName}
        blurOnSubmit={false}
        style={{ borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
      />
      <TextInput
        placeholder="Số tiền mặc định"
        placeholderTextColor={c.subtext}
        keyboardType="numeric"
        value={row.defaultAmount ?? ''}
        onChangeText={onChangeAmount}   // ⬅️ đã format ngay khi gõ
        blurOnSubmit={false}
        style={{ borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
      />
      <Button title="Xoá" variant="ghost" onPress={onRemove}/>
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
  return (
    <View style={{borderRadius:10, padding:10, gap:8}}>
      <TextInput
        placeholder="Tên khoản chi (không cố định)"
        placeholderTextColor={c.subtext}
        value={row.name ?? ''}
        onChangeText={onChangeName}
        blurOnSubmit={false}
        style={{ borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
      />
      <Button title="Xoá" variant="ghost" onPress={onRemove}/>
    </View>
  );
});
