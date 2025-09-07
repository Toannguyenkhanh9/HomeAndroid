import React,{useState} from 'react';
import {View, Text, Alert} from 'react-native';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import {useThemeColors} from '../theme';
import {useUIStore} from '../store/ui';
import {exportAllAsJson, importFromJson} from '../../services/backup';
import {seedDemo} from '../../services/seed';
import {useI18n} from '../../i18n';

export default function Settings() {
  const c = useThemeColors();
  const {t, lang, setLang} = useI18n();
  const {themeMode, toggleTheme, currency, setCurrency, dateFormat, setDateFormat, notificationsEnabled, setNotificationsEnabled} = useUIStore();
  const [jsonText, setJsonText] = useState('');

  return (
    <View style={{flex:1, padding:16, backgroundColor: c.bg}}>
      <Header title={t('settings')} />
      <Card>
        <Text style={{color: c.text, fontWeight:'700'}}>{t('language')}</Text>
        <View style={{flexDirection:'row', gap:8, marginTop:8}}>
          <Button title={t('vietnamese')} variant={lang==='vi'?'primary':'ghost'} onPress={()=>setLang('vi')} />
          <Button title={t('english')} variant={lang==='en'?'primary':'ghost'} onPress={()=>setLang('en')} />
        </View>
      </Card>

      <Card>
        <Text style={{color: c.text}}>{t('theme')}: {themeMode}</Text>
        <Button title={t('switchTheme')} onPress={toggleTheme} />
      </Card>

      <Card>
        <Text style={{color: c.text, fontWeight:'700'}}>{t('format')}</Text>
        <View style={{height:8}}/>
        <Text style={{color:c.text}}>{t('currency')}: {currency}</Text>
        <View style={{flexDirection:'row', gap:8}}>
          <Button title="VND" variant="ghost" onPress={()=>setCurrency('VND')} />
          <Button title="USD" variant="ghost" onPress={()=>setCurrency('USD')} />
        </View>
        <View style={{height:8}}/>
        <Text style={{color:c.text}}>{t('date')}: {dateFormat}</Text>
        <View style={{flexDirection:'row', gap:8}}>
          <Button title="YYYY-MM-DD" variant="ghost" onPress={()=>setDateFormat('YYYY-MM-DD')} />
          <Button title="DD/MM/YYYY" variant="ghost" onPress={()=>setDateFormat('DD/MM/YYYY')} />
        </View>
      </Card>

      <Card>
        <Text style={{color: c.text, fontWeight:'700'}}>{t('notif')}</Text>
        <Text style={{color:c.subtext, marginBottom:8}}>{t('notifHint')}</Text>
        <Button
          title={notificationsEnabled? t('toggleNotifOff') : t('toggleNotifOn')}
          onPress={()=>{
            setNotificationsEnabled(!notificationsEnabled);
            Alert.alert('OK', ''); // message đơn giản
          }}
        />
      </Card>

      <Card>
        <Text style={{color: c.text, fontWeight:'700'}}>{t('backup')}</Text>
        <View style={{height:8}}/>
        <Button title={t('exportJson')} onPress={()=> setJsonText(exportAllAsJson(true))} />
        <View style={{height:8}}/>
        <Input placeholder={t('pasteJson')} value={jsonText} onChangeText={setJsonText} multiline numberOfLines={6} style={{height:120, textAlignVertical:'top'}} />
        <Button title={t('importJson')} variant="danger" onPress={()=> { importFromJson(jsonText); Alert.alert('OK', t('importedOk')); }} />
      </Card>

      <Card>
        <Text style={{color: c.text, fontWeight:'700'}}>{t('demoData')}</Text>
        <Button title={t('createDemo')} onPress={()=>{ const r = seedDemo(); Alert.alert('OK', JSON.stringify(r, null, 2)); }} />
      </Card>
    </View>
  );
}
