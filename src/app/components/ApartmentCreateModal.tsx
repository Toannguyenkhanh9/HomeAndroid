// src/app/components/ApartmentCreateModal.tsx
import React, {useState} from 'react';
import {Modal, View, Text, TextInput, KeyboardAvoidingView, Platform, Alert} from 'react-native';
import Button from './Button';
import {useThemeColors} from '../theme';
import {createApartment} from '../../services/rent';
import {useTranslation} from 'react-i18next';

export default function ApartmentCreateModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void; // reload list sau khi tạo
}) {
  const c = useThemeColors();
  const {t} = useTranslation();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const reset = () => { setName(''); setAddress(''); };

  const onSave = () => {
    try {
      if (!name.trim()) return Alert.alert(t('apartmentCreate.enterName'));
      createApartment(name.trim(), address.trim() || undefined);
      reset();
      onClose();
      onCreated();
    } catch (e:any) {
      Alert.alert(t('apartmentCreate.cannotCreate'), e?.message || t('apartmentCreate.tryAgain'));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex:1}}>
        <View style={{flex:1, backgroundColor:'#0006', justifyContent:'flex-end'}}>
          <View style={{backgroundColor:c.bg, padding:16, borderTopLeftRadius:16, borderTopRightRadius:16}}>
            <Text style={{color:c.text, fontWeight:'700', fontSize:16, marginBottom:8}}>
              {t('apartmentCreate.title')}
            </Text>

            <TextInput
              placeholder={t('apartmentCreate.namePlaceholder')}
              placeholderTextColor={c.subtext}
              value={name}
              onChangeText={setName}
              style={{backgroundColor:c.card, color:c.text, padding:10, borderRadius:10, marginBottom:10}}
            />
            <TextInput
              placeholder={t('apartmentCreate.addressPlaceholder')}
              placeholderTextColor={c.subtext}
              value={address}
              onChangeText={setAddress}
              style={{backgroundColor:c.card, color:c.text, padding:10, borderRadius:10, marginBottom:16}}
            />

            <View style={{flexDirection:'row', justifyContent:'flex-end', gap:8}}>
              <Button title={t('cancel')} variant="ghost" onPress={()=>{ reset(); onClose(); }} />
              <Button title={t('apartmentCreate.saveBtn')} onPress={onSave} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
