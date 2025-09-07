import React, {useState} from 'react';
import {Modal, View, Text, TextInput, KeyboardAvoidingView, Platform, Alert} from 'react-native';
import Button from './Button';
import {useThemeColors} from '../theme';
import {createApartment} from '../../services/rent';

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
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const reset = () => { setName(''); setAddress(''); };

  const onSave = () => {
    try {
      if (!name.trim()) return Alert.alert('Vui lòng nhập tên căn hộ');
      createApartment(name.trim(), address.trim() || undefined);
      reset();
      onClose();
      onCreated();
    } catch (e:any) {
      Alert.alert('Không thể tạo căn hộ', e?.message || 'Vui lòng thử lại');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex:1}}>
        <View style={{flex:1, backgroundColor:'#0006', justifyContent:'flex-end'}}>
          <View style={{backgroundColor:c.bg, padding:16, borderTopLeftRadius:16, borderTopRightRadius:16}}>
            <Text style={{color:c.text, fontWeight:'700', fontSize:16, marginBottom:8}}>Thêm căn hộ</Text>

            <TextInput
              placeholder="Tên căn hộ"
              placeholderTextColor={c.subtext}
              value={name}
              onChangeText={setName}
              style={{borderWidth:1, borderColor:'#2A2F3A', backgroundColor:c.card, color:c.text, padding:10, borderRadius:10, marginBottom:10}}
            />
            <TextInput
              placeholder="Địa chỉ (tuỳ chọn)"
              placeholderTextColor={c.subtext}
              value={address}
              onChangeText={setAddress}
              style={{borderWidth:1, borderColor:'#2A2F3A', backgroundColor:c.card, color:c.text, padding:10, borderRadius:10, marginBottom:16}}
            />

            <View style={{flexDirection:'row', justifyContent:'flex-end', gap:8}}>
              <Button title="Huỷ" variant="ghost" onPress={()=>{ reset(); onClose(); }} />
              <Button title="Lưu căn hộ" onPress={onSave} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
