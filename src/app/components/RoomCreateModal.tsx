// src/app/components/RoomCreateModal.tsx
import React, {useState} from 'react';
import {Modal, View, Text, TextInput, KeyboardAvoidingView, Platform, Alert} from 'react-native';
import Button from './Button';
import {useThemeColors} from '../theme';
import {createRoom} from '../../services/rent';
import {useTranslation} from 'react-i18next';

export default function RoomCreateModal({
  visible,
  onClose,
  apartmentId,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  apartmentId: string;
  onCreated: () => void;
}) {
  const {t} = useTranslation();
  const c = useThemeColors();
  const [code, setCode] = useState('');
  const [floor, setFloor] = useState('');
  const [area, setArea] = useState('');

  const reset = () => { setCode(''); setFloor(''); setArea(''); };

  const onSave = () => {
    try {
      if (!apartmentId) return Alert.alert(t('roomCreate.missingApartmentId'));
      if (!code.trim()) return Alert.alert(t('roomCreate.enterRoomCode'));
      createRoom(
        apartmentId,
        code.trim(),
        floor ? Number(floor) : undefined,
        area ? Number(area) : undefined
      );
      reset();
      onClose();
      onCreated();
    } catch (e: any) {
  const msg = String(e?.message || '');
  if (msg.includes('DUPLICATE_ROOM_CODE') || msg.includes('UNIQUE')) {
    Alert.alert(t('roomCreate.createFail'), t('roomCreate.duplicateCode'));
  } else if (msg.includes('EMPTY_CODE')) {
    Alert.alert(t('roomCreate.createFail'), t('roomCreate.enterRoomCode'));
  } else {
    Alert.alert(t('roomCreate.createFail'), t('common.tryAgain'));
  }
}
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
        <View style={{flex:1, backgroundColor:'#0006', justifyContent:'flex-end'}}>
          <View style={{backgroundColor:c.bg, padding:16, borderTopLeftRadius:16, borderTopRightRadius:16}}>
            <Text style={{color:c.text, fontWeight:'700', fontSize:16, marginBottom:8}}>
              {t('roomCreate.title')}
            </Text>

            <TextInput
              placeholder={t('roomCreate.codePlaceholder')}
              placeholderTextColor={c.subtext}
              value={code}
              onChangeText={setCode}
              style={{backgroundColor:c.card, color:c.text, padding:10, borderRadius:10, marginBottom:10}}
            />
            <TextInput
              placeholder={t('roomCreate.floorPlaceholder')}
              placeholderTextColor={c.subtext}
              keyboardType="numeric"
              value={floor}
              onChangeText={setFloor}
              style={{ backgroundColor:c.card, color:c.text, padding:10, borderRadius:10, marginBottom:10}}
            />
            <TextInput
              placeholder={t('roomCreate.areaPlaceholder')}
              placeholderTextColor={c.subtext}
              keyboardType="numeric"
              value={area}
              onChangeText={setArea}
              style={{backgroundColor:c.card, color:c.text, padding:10, borderRadius:10, marginBottom:16}}
            />

            <View style={{flexDirection:'row', justifyContent:'flex-end', gap:8}}>
              <Button title={t('common.cancel')} variant="ghost" onPress={()=>{ reset(); onClose(); }} />
              <Button title={t('roomCreate.save')} onPress={onSave} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
