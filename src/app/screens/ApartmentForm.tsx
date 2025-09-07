import React, {useState} from 'react';
import {View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {createApartment} from '../../services/rent';
import Input from '../components/Input';
import Button from '../components/Button';
import Card from '../components/Card';
import Header from '../components/Header';
import {useThemeColors} from '../theme';

export default function ApartmentForm({navigation}: NativeStackScreenProps<RootStackParamList, 'ApartmentForm'>) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const c = useThemeColors();
  return (
    <View style={{flex:1, padding:16, backgroundColor: c.bg}}>
      <Header title="Thêm căn hộ" />
      <Card>
        <Input placeholder="Tên căn hộ" value={name} onChangeText={setName} />
        <View style={{height:8}}/>
        <Input placeholder="Địa chỉ" value={address} onChangeText={setAddress} />
        <Button title="Lưu" onPress={() => {
          if (!name.trim()) return;
          createApartment(name.trim(), address.trim() || undefined);
          navigation.goBack();
        }} />
      </Card>
    </View>
  );
}
