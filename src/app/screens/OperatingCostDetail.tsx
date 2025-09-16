// src/app/screens/OperatingCostDetail.tsx
import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, ScrollView, TextInput, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {useCurrency} from '../../utils/currency';
import {groupVN, onlyDigits} from '../../utils/number';
import {
  ensureOperatingMonth,
  listOperatingExpenses,
  addOperatingExpense,
  listFixedExpenseTemplates,
  addFixedExpenseTemplate,
  removeFixedExpenseTemplate
} from '../../services/rent';

type Props = NativeStackScreenProps<RootStackParamList, 'OperatingCostDetail'>;

export default function OperatingCostDetail({route}: Props) {
  const {apartmentId, ym} = route.params as any; // ym = "YYYY-MM"
  const c = useThemeColors();
  const {format} = useCurrency();

  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'fixed'|'variable'>('variable');

  // templates phí cố định
  const [templates, setTemplates] = useState<any[]>([]);
  const [tplName, setTplName] = useState('');
  const [tplAmount, setTplAmount] = useState('');

  const reload = () => {
    ensureOperatingMonth(apartmentId, ym);
    setItems(listOperatingExpenses(apartmentId, ym));
    setTemplates(listFixedExpenseTemplates(apartmentId));
  };
  useEffect(reload, [apartmentId, ym]);

  const total = useMemo(
    () => items.reduce((s, x) => s + (Number(x.amount)||0), 0),
    [items]
  );

  return (
    <View style={{flex:1, backgroundColor:'transparent'}}>
      <Header title={`Chi phí ${ym}`} />
      <ScrollView contentContainerStyle={{padding:12, gap:12}}>
        <Card>
          <Text style={{color:c.text, fontWeight:'700'}}>Khoản chi của tháng</Text>
          {items.length === 0 ? (
            <Text style={{color:c.subtext}}>— Chưa có chi phí.</Text>
          ) : items.map(it => (
            <View key={it.id} style={{ borderRadius:10, padding:10, marginTop:8}}>
              <Text style={{color:c.text, fontWeight:'700'}}>{it.name}</Text>
              <Text style={{color:c.subtext}}>{it.type === 'fixed' ? 'Cố định' : 'Không cố định'}</Text>
              <Text style={{color:c.text}}>Số tiền: {format(it.amount || 0)}</Text>
              {!!it.note && <Text style={{color:c.subtext}}>Ghi chú: {it.note}</Text>}
            </View>
          ))}
          <Text style={{color:c.text, marginTop:8, fontWeight:'700'}}>Tổng: {format(total)}</Text>
        </Card>

        <Card style={{gap:8}}>
          <Text style={{color:c.text, fontWeight:'700'}}>Thêm khoản chi</Text>
          <View style={{flexDirection:'row', gap:8}}>
            <Button title={kind==='variable'?'Không cố định':'Cố định'} variant="ghost"
              onPress={()=>setKind(kind==='variable'?'fixed':'variable')} />
          </View>
          <TextInput
            placeholder="Tên chi phí"
            placeholderTextColor={c.subtext}
            value={name}
            onChangeText={setName}
            style={{borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}
          />
          <TextInput
            placeholder="Số tiền"
            placeholderTextColor={c.subtext}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            onBlur={()=>setAmount(groupVN(amount))}
            style={{borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}
          />
          <Button
            title="Lưu"
            onPress={()=>{
              const amt = Number(onlyDigits(amount))||0;
              if (!name.trim() || amt<=0) { Alert.alert('Thiếu', 'Nhập tên & số tiền > 0'); return; }
              addOperatingExpense(apartmentId, ym, {name:name.trim(), amount:amt, type:kind});
              setName(''); setAmount('');
              reload();
            }}
          />
        </Card>

        <Card style={{gap:8}}>
          <Text style={{color:c.text, fontWeight:'700'}}>Mẫu chi phí cố định (tự sinh mỗi tháng)</Text>
          {templates.length===0 ? (
            <Text style={{color:c.subtext}}>— Chưa có mẫu.</Text>
          ) : templates.map(t => (
            <View key={t.id} style={{ borderRadius:10, padding:10}}>
              <Text style={{color:c.text, fontWeight:'700'}}>{t.name}</Text>
              <Text style={{color:c.text}}>Mặc định: {format(t.amount || 0)}</Text>
              <View style={{alignItems:'flex-end'}}>
                <Button title="Xoá" variant="ghost" onPress={()=>{ removeFixedExpenseTemplate(t.id); reload(); }} />
              </View>
            </View>
          ))}
          <Text style={{color:c.subtext}}>Thêm mẫu mới</Text>
          <TextInput
            placeholder="Tên mẫu (VD: Tiền nhà, Internet, Rác, Lương BV...)"
            placeholderTextColor={c.subtext}
            value={tplName}
            onChangeText={setTplName}
            style={{borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}
          />
          <TextInput
            placeholder="Số tiền mặc định"
            placeholderTextColor={c.subtext}
            keyboardType="numeric"
            value={tplAmount}
            onChangeText={setTplAmount}
            onBlur={()=>setTplAmount(groupVN(tplAmount))}
            style={{borderRadius:10,padding:10,color:c.text,backgroundColor:c.card}}
          />
          <Button title="Thêm mẫu" onPress={()=>{
            const v = Number(onlyDigits(tplAmount))||0;
            if (!tplName.trim() || v<=0) { Alert.alert('Thiếu','Nhập tên & số tiền > 0'); return; }
            addFixedExpenseTemplate(apartmentId, {name: tplName.trim(), amount: v});
            setTplName(''); setTplAmount('');
            reload();
          }}/>
        </Card>
      </ScrollView>
    </View>
  );
}
