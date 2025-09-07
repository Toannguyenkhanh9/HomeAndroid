import React, {useState} from 'react';
import {View} from 'react-native';
import Header from '../components/Header';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {createTenant} from '../../services/rent';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';

export default function TenantForm({navigation}: NativeStackScreenProps<RootStackParamList, 'TenantForm'>) {
  const c = useThemeColors();
  const [name,setName] = useState('');
  const [phone,setPhone] = useState('');
  const [idnum,setIdnum] = useState('');
  const [note,setNote] = useState('');
  return (
    <View style={{flex:1, padding:16, backgroundColor:c.bg}}>
      <Header title="Thêm người thuê" />
      <Card>
        <Input placeholder="Họ tên" value={name} onChangeText={setName} />
        <View style={{height:8}}/>
        <Input placeholder="Điện thoại" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <View style={{height:8}}/>
        <Input placeholder="Số CMND/CCCD" value={idnum} onChangeText={setIdnum} />
        <View style={{height:8}}/>
        <Input placeholder="Ghi chú" value={note} onChangeText={setNote} />
        <Button title="Lưu" onPress={()=>{ if(!name.trim()) return; createTenant(name.trim(), phone.trim()||undefined, idnum.trim()||undefined, note.trim()||undefined); navigation.goBack(); }} />
      </Card>
    </View>
  );
}
