// src/app/screens/TenantForm.tsx
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
import {useTranslation} from 'react-i18next';

export default function TenantForm({navigation}: NativeStackScreenProps<RootStackParamList, 'TenantForm'>) {
  const {t} = useTranslation();
  const c = useThemeColors();
  const [name,setName] = useState('');
  const [phone,setPhone] = useState('');
  const [idnum,setIdnum] = useState('');
  const [note,setNote] = useState('');

  return (
    <View style={{flex:1, padding:16, backgroundColor:'transparent'}}>
      <Header title={t('tenantForm.addTenant')} />
      <Card>
        <Input placeholder={t('tenantForm.fullName')} value={name} onChangeText={setName} />
        <View style={{height:8}}/>
        <Input placeholder={t('tenantForm.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <View style={{height:8}}/>
        <Input placeholder={t('tenantForm.idNumber')} value={idnum} onChangeText={setIdnum} />
        <View style={{height:8}}/>
        <Input placeholder={t('tenantForm.note')} value={note} onChangeText={setNote} />
        <Button
          title={t('tenantForm.save')}
          onPress={()=>{
            if(!name.trim()) return;
            createTenant(
              name.trim(),
              phone.trim()||undefined,
              idnum.trim()||undefined,
              note.trim()||undefined
            );
            navigation.goBack();
          }}
        />
      </Card>
    </View>
  );
}
