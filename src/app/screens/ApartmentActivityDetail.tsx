import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, FlatList, TextInput, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {listOperatingExpenses, sumOperatingExpenses, sumIncomeByApartmentMonth, addOperatingExpense} from '../../services/activities';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {useUIStore} from '../store/ui';
import {formatMoney} from '../../utils/currency';

export default function ApartmentActivityDetail({route}: NativeStackScreenProps<RootStackParamList, 'ApartmentActivityDetail'>) {
  const {apartmentId, year, month} = route.params;
  const c = useThemeColors();
  const currency = useUIStore(s=>s.currency);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [income, setIncome] = useState(0);
  const [expenseSum, setExpenseSum] = useState(0);

  function reload(){
    setExpenses(listOperatingExpenses(apartmentId, year, month));
    setIncome(sumIncomeByApartmentMonth(apartmentId, year, month));
    setExpenseSum(sumOperatingExpenses(apartmentId, year, month));
  }
  useEffect(reload, [apartmentId, year, month]);

  const profit = useMemo(()=> income - expenseSum, [income, expenseSum]);

  const now = new Date();
  const isCurrentMonth = (now.getFullYear() === year && (now.getMonth()+1) === month);

  return (
    <View style={{flex:1, padding:16, backgroundColor: c.bg}}>
      <Header title={`Hoạt động ${year}-${String(month).padStart(2,'0')}`} />
      <Card>
        <Text style={{color:c.text}}>Tổng thu (các phòng): <Text style={{fontWeight:'700'}}>{formatMoney(income, currency)}</Text></Text>
        <Text style={{color:c.text}}>Tổng chi hoạt động: <Text style={{fontWeight:'700'}}>{formatMoney(expenseSum, currency)}</Text></Text>
        <Text style={{color: profit>=0 ? '#10B981' : '#EF4444', marginTop:6}}>Lợi nhuận: <Text style={{fontWeight:'700'}}>{formatMoney(profit, currency)}</Text></Text>
      </Card>

      <Card>
        <Text style={{color:c.text, fontWeight:'700', marginBottom:8}}>Chi phí hoạt động</Text>
        <FlatList
          data={expenses}
          keyExtractor={(i)=>i.id}
          renderItem={({item})=>(
            <View style={{flexDirection:'row', justifyContent:'space-between', marginVertical:4}}>
              <Text style={{color:c.text}}>{item.name}</Text>
              <Text style={{color:c.text}}>{formatMoney(item.amount, currency)}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={{color:c.text, opacity:0.7}}>Chưa có chi phí</Text>}
        />
      </Card>

      {isCurrentMonth && (
        <Card>
          <Text style={{color:c.text, fontWeight:'700', marginBottom:8}}>Thêm chi phí hoạt động (tháng hiện tại)</Text>
          <View style={{flexDirection:'row', gap:8}}>
            <TextInput placeholder="Tên khoản phí (VD: thuê, điện, nước, internet, rác, sửa chữa, bảo trì, ...)" value={expenseName} onChangeText={setExpenseName} style={{flex:1, borderWidth:1, borderColor:c.border, color:c.text, padding:8, borderRadius:8}}/>
            <TextInput placeholder="Số tiền" value={expenseAmount} onChangeText={setExpenseAmount} keyboardType="numeric" style={{width:140, borderWidth:1, borderColor:c.border, color:c.text, padding:8, borderRadius:8}}/>
          </View>
          <Button title="Thêm chi phí" onPress={()=>{
            if (!expenseName.trim() || !expenseAmount.trim()) return Alert.alert('Vui lòng nhập tên & số tiền');
            addOperatingExpense(apartmentId, expenseName.trim(), Number(expenseAmount));
            setExpenseName(''); setExpenseAmount('');
            reload();
          }} />
        </Card>
      )}
    </View>
  );
}
