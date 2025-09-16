import React, {useEffect, useState} from 'react';
import {Modal, View, Text, TextInput, FlatList} from 'react-native';
import Button from './Button';
import {useThemeColors} from '../theme';
import {listChargesByLease} from '../../services/rent';

export default function VariableFeesModal({
  visible, leaseId, onClose, onSubmit
}: {
  visible: boolean;
  leaseId: string;
  onClose: () => void;
  onSubmit: (variables: Array<{charge_type_id: string; quantity: number}>, extras: Array<{name:string; amount:number}>) => void;
}) {
  const c = useThemeColors();
  const [vars, setVars] = useState<Array<{charge_type_id:string; name:string; unit?:string; quantity:string}>>([]);
  const [extras, setExtras] = useState<Array<{name:string; amount:string}>>([{name:'', amount:''}]);

  useEffect(()=> {
    if (!visible) return;
    const charges = listChargesByLease(leaseId).filter((x:any)=> Number(x.is_variable) === 1);
    setVars(charges.map((x:any)=> ({charge_type_id: x.charge_type_id, name: x.name, unit: x.unit, quantity: ''})));
    setExtras([{name:'', amount:''}]);
  }, [visible, leaseId]);

  const setQty = (id:string, v:string) => setVars(prev=> prev.map(x=> x.charge_type_id===id ? {...x, quantity: v} : x));
  const setExtra = (idx:number, key:'name'|'amount', v:string) => setExtras(prev=> prev.map((x,i)=> i===idx? {...x,[key]:v}:x));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{flex:1, backgroundColor:'#0006', justifyContent:'flex-end'}}>
        <View style={{backgroundColor:c.bg, padding:16, borderTopLeftRadius:12, borderTopRightRadius:12, maxHeight:'80%'}}>
          <Text style={{color:c.text, fontWeight:'700', marginBottom:8}}>Nhập các phí không cố định</Text>

          <FlatList
            data={vars}
            keyExtractor={(i)=>i.charge_type_id}
            renderItem={({item})=>(
              <View style={{flexDirection:'row', alignItems:'center', gap:8, marginVertical:6}}>
                <Text style={{color:c.text, flex:1}}>{item.name}{item.unit? ` (${item.unit})`:''}</Text>
                <TextInput
                  style={{ padding:6, borderRadius:8, width:120, color:c.text}}
                  keyboardType="numeric" placeholder="Số lượng"
                  value={item.quantity}
                  onChangeText={(t)=> setQty(item.charge_type_id, t)}
                />
              </View>
            )}
          />

          <View style={{height:12}}/>
          <Text style={{color:c.text, fontWeight:'700'}}>Thêm chi phí phát sinh</Text>
          <FlatList
            data={extras}
            keyExtractor={(_,i)=>String(i)}
            renderItem={({item, index})=>(
              <View style={{flexDirection:'row', gap:8, marginVertical:6}}>
                <TextInput style={{padding:6, borderRadius:8, color:c.text}} placeholder="Tên chi phí" value={item.name} onChangeText={(t)=> setExtra(index, 'name', t)}/>
                <TextInput style={{width:120, padding:6, borderRadius:8, color:c.text}} placeholder="Số tiền" keyboardType="numeric" value={item.amount} onChangeText={(t)=> setExtra(index, 'amount', t)}/>
              </View>
            )}
            ListFooterComponent={<Button title="Thêm dòng" variant="ghost" onPress={()=> setExtras(prev=> [...prev, {name:'', amount:''}])} />}
          />

          <View style={{height:12}}/>
          <View style={{flexDirection:'row', justifyContent:'flex-end', gap:8}}>
            <Button title="Đóng" variant="ghost" onPress={onClose}/>
            <Button title="Xác nhận" onPress={()=>{
              const variables = vars.map(v=> ({charge_type_id: v.charge_type_id, quantity: Number(v.quantity)||0}));
              const extraCosts = extras.filter(e=> e.name.trim() && Number(e.amount)>0).map(e=> ({name: e.name.trim(), amount: Number(e.amount)}));
              onSubmit(variables, extraCosts);
              onClose();
            }}/>
          </View>
        </View>
      </View>
    </Modal>
  );
}
