// src/app/screens/Settings.tsx
import React, { useState } from 'react';
import { View, Text, Alert,ScrollView } from 'react-native';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import { useThemeColors } from '../theme';
import { useUIStore } from '../store/ui';
import { exportAllAsJson, importFromJson } from '../../services/backup';
import { seedDemo } from '../../services/seed';
import { useI18n } from '../../i18n';
import { useSettings } from '../state/SettingsContext'; // << dùng context mới
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useNavigation} from '@react-navigation/native';

export default function Settings() {
  const c = useThemeColors();
  const { t, setLang } = useI18n();
  const navigation = useNavigation<any>();

  // theme + notifications từ UI store cũ
  const {
    themeMode,
    toggleTheme,
    notificationsEnabled,
    setNotificationsEnabled,
  } = useUIStore();

  // language + date format từ SettingsContext mới
  const { language, setLanguage, dateFormat, setDateFormat } = useSettings();

  const [jsonText, setJsonText] = useState('');

  const LANGS: Array<{ code:
    'vi'|'en'|'es'|'fr'|'de'|'zh'|'ja'|'ko'|'ru'|'ar'; label: string }> = [
    { code: 'vi', label: 'Tiếng Việt' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'zh', label: '中文' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'ru', label: 'Русский' },
    { code: 'ar', label: 'العربية' },
  ];

  const applyLanguage = (lng: typeof LANGS[number]['code']) => {
    // lưu vào SettingsContext (persist) + cập nhật i18n runtime
    setLanguage(lng);
    setLang(lng);
  };

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor:'transparent' }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32,
          gap: 16, // khoảng cách đều giữa các Card
        }}
      >
      {/* Language */}
      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('language')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {LANGS.map((it) => (
            <Button
              key={it.code}
              title={it.label}
              variant={language === it.code ? 'primary' : 'ghost'}
              onPress={() => applyLanguage(it.code)}
            />
          ))}
        </View>
      </Card>

      {/* Theme */}
      {/* <Card>
        <Text style={{ color: c.text }}>{t('theme')}: {String(themeMode)}</Text>
        <View style={{ height: 8 }} />
        <Button title={t('switchTheme')} onPress={toggleTheme} />
      </Card> */}

      {/* Date format (đã bỏ Currency) */}
      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('format')}</Text>
        <View style={{ height: 8 }} />
        <Text style={{ color: c.text }}>{t('date')}: {dateFormat}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <Button
            title="YYYY-MM-DD"
            variant={dateFormat === 'YYYY-MM-DD' ? 'primary' : 'ghost'}
            onPress={() => setDateFormat('YYYY-MM-DD')}
          />
          <Button
            title="DD/MM/YYYY"
            variant={dateFormat === 'DD/MM/YYYY' ? 'primary' : 'ghost'}
            onPress={() => setDateFormat('DD/MM/YYYY')}
          />
        </View>
      </Card>

      {/* Notifications */}
      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('notif')}</Text>
        <Text style={{ color: c.subtext, marginBottom: 8 }}>{t('notifHint')}</Text>
        <Button
          title={notificationsEnabled ? t('toggleNotifOff') : t('toggleNotifOn')}
          onPress={() => {
            setNotificationsEnabled(!notificationsEnabled);
            Alert.alert('OK', '');
          }}
        />
      </Card>

      {/* Backup / Restore */}
      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('backup')}</Text>
        <View style={{ height: 8 }} />
        <Button
          title={t('exportJson')}
          onPress={() => setJsonText(exportAllAsJson(true))}
        />
        <View style={{ height: 8 }} />
        <Input
          placeholder={t('pasteJson')}
          value={jsonText}
          onChangeText={setJsonText}
          multiline
          numberOfLines={6}
          style={{ height: 120, textAlignVertical: 'top' }}
        />
        <Button
          title={t('importJson')}
          variant="danger"
          onPress={() => {
            importFromJson(jsonText);
            Alert.alert('OK', t('importedOk'));
          }}
        />
      </Card>
       {/* <Card>
          <Text style={{ color: c.text, fontWeight: '700' }}>Hướng dẫn sử dụng</Text>
          <View style={{ height: 8 }} />
          <Button
            title="Xem hướng dẫn"
            onPress={async () => {
              await AsyncStorage.removeItem('has_seen_onboarding');
              // chuyển sang Onboarding
              navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
            }}
          />
        </Card> */}

      {/* Sample data */}
      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('demoData')}</Text>
        <Button
          title={t('createDemo')}
          onPress={() => {
            const r = seedDemo();
            Alert.alert('OK', JSON.stringify(r, null, 2));
          }}
        />
      </Card>
      </ScrollView>
    </View>
    
  );
}
