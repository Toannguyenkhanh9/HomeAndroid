import React, {useState} from 'react';
import {View, Text} from 'react-native';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import {useThemeColors} from '../theme';
import {useUIStore} from '../store/ui';
import {exportAllAsJson, importFromJson} from '../../services/backup';

export default function Settings() {
  const c = useThemeColors();
  const {themeMode, toggleTheme, currency, setCurrency, dateFormat, setDateFormat} = useUIStore();
  const [jsonText, setJsonText] = useState('');

  return (
    <View style={{flex:1, padding:16, backgroundColor: c.bg}}>
      <Header title="Cài đặt" />
      <Card>
        <Text style={{color: c.text}}>Giao diện: {themeMode}</Text>
        <Button title="Đổi theme" onPress={toggleTheme} />
      </Card>

      <Card>
        <Text style={{color: c.text, fontWeight:'700'}}>Định dạng</Text>
        <View style={{height:8}}/>
        <Text style={{color:c.text}}>Tiền tệ: {currency}</Text>
        <View style={{flexDirection:'row', gap:8}}>
          <Button title="VND" variant="ghost" onPress={()=>setCurrency('VND')} />
          <Button title="USD" variant="ghost" onPress={()=>setCurrency('USD')} />
        </View>
        <View style={{height:8}}/>
        <Text style={{color:c.text}}>Ngày: {dateFormat}</Text>
        <View style={{flexDirection:'row', gap:8}}>
          <Button title="YYYY-MM-DD" variant="ghost" onPress={()=>setDateFormat('YYYY-MM-DD')} />
          <Button title="DD/MM/YYYY" variant="ghost" onPress={()=>setDateFormat('DD/MM/YYYY')} />
        </View>
      </Card>

      <Card>
        <Text style={{color: c.text, fontWeight:'700'}}>Sao lưu / Phục hồi</Text>
        <View style={{height:8}}/>
        <Button title="Export JSON" onPress={()=> setJsonText(exportAllAsJson(true))} />
        <View style={{height:8}}/>
        <Input placeholder="Dán JSON để Import..." value={jsonText} onChangeText={setJsonText} multiline numberOfLines={6} style={{height:120, textAlignVertical:'top'}} />
        <Button title="Import từ JSON" variant="danger" onPress={()=> importFromJson(jsonText)} />
      </Card>
    </View>
  );
}