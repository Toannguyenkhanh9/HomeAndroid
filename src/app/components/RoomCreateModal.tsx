import React, {useState} from 'react';
import {Modal, View, Text, TextInput, KeyboardAvoidingView, Platform, Alert} from 'react-native';
import Button from './Button';
import {useThemeColors} from '../theme';
import {createRoom} from '../../services/rent';

export default function RoomCreateModal({
  visible,
  onClose,
  apartmentId,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  apartmentId: string;
  onCreated: () => void; // gọi reload sau khi tạo
}) {
  const c = useThemeColors();
  const [code, setCode] = useState('');
  const [floor, setFloor] = useState('');
  const [area, setArea] = useState('');

  const reset = () => { setCode(''); setFloor(''); setArea(''); };

  const onSave = () => {
    try {
      if (!apartmentId) return Alert.alert('Thiếu apartmentId');
      if (!code.trim()) return Alert.alert('Vui lòng nhập mã phòng');
      createRoom(apartmentId, code.trim(), floor ? Number(floor) : undefined, area ? Number(area) : undefined);
      reset();
      onClose();
      onCreated(); // reload list
    } catch (e: any) {
      Alert.alert('Không thể tạo phòng', e?.message || 'Vui lòng thử lại');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
        <View style={{flex:1, backgroundColor:'#0006', justifyContent:'flex-end'}}>
          <View style={{backgroundColor:c.bg, padding:16, borderTopLeftRadius:16, borderTopRightRadius:16}}>
            <Text style={{color:c.text, fontWeight:'700', fontSize:16, marginBottom:8}}>Thêm phòng</Text>

            <TextInput
              placeholder="Mã phòng (VD: P201)"
              placeholderTextColor={c.subtext}
              value={code}
              onChangeText={setCode}
              style={{backgroundColor:c.card, color:c.text, padding:10, borderRadius:10, marginBottom:10}}
            />
            <TextInput
              placeholder="Tầng"
              placeholderTextColor={c.subtext}
              keyboardType="numeric"
              value={floor}
              onChangeText={setFloor}
              style={{ backgroundColor:c.card, color:c.text, padding:10, borderRadius:10, marginBottom:10}}
            />
            <TextInput
              placeholder="Diện tích (m2)"
              placeholderTextColor={c.subtext}
              keyboardType="numeric"
              value={area}
              onChangeText={setArea}
              style={{backgroundColor:c.card, color:c.text, padding:10, borderRadius:10, marginBottom:16}}
            />

            <View style={{flexDirection:'row', justifyContent:'flex-end', gap:8}}>
              <Button title="Huỷ" variant="ghost" onPress={()=>{ reset(); onClose(); }} />
              <Button title="Lưu phòng" onPress={onSave} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
