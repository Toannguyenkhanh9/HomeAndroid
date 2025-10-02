import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Image, Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import Card from '../components/Card';
import Button from '../components/Button';
import { useThemeColors } from '../theme';
import { useTranslation } from 'react-i18next';
import {
  PaymentProfile,
  loadPaymentProfile,
  savePaymentProfile,
  clearPaymentProfile,
} from '../../services/paymentProfile';

export default function PaymentProfileScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const c = useThemeColors();

  const [p, setP] = useState<PaymentProfile>({});

  useEffect(() => {
    loadPaymentProfile().then(setP);
  }, []);

  const pick = async (key: 'logoPath' | 'qrPath') => {
    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        includeExtra: false,
        selectionLimit: 1,
      });
      const uri = res.assets?.[0]?.uri;
      if (uri) setP(prev => ({ ...prev, [key]: uri.startsWith('file://') ? uri : `file://${uri}` }));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Select image failed');
    }
  };

  const save = async () => {
    await savePaymentProfile(p);
    Alert.alert(t('common.success') || 'Success', t('common.saved') || 'Saved');
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 120, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Banner thông tin hóa đơn */}
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          // Nền xanh nhạt + viền nhẹ để nổi bật (trung lập với theme)
          backgroundColor: 'rgba(16,185,129,0.08)', // emerald-500 @8%
          borderWidth: 1,
          borderColor: 'rgba(16,185,129,0.35)',     // emerald-500 @35%
        }}
      >
        <Text style={{ fontSize: 18, marginTop: 2 }}>🧾</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: '700', marginBottom: 4 }}>
            {t('payment.invoiceInfoTitle') || 'Lưu ý hóa đơn'}
          </Text>
          <Text style={{ color: c.subtext, lineHeight: 18 }}>
            {t('payment.invoiceInfo') || 'Thông tin thanh toán sẽ hiển thị trên hóa đơn gửi cho khách thuê'}
          </Text>
        </View>
      </View>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>
          {t('payment.title') || 'Payment profile'}
        </Text>

        <Text style={{ color: c.subtext }}>{t('payment.brandName') || 'Brand / Business name'}</Text>
        <TextInput
          value={p.brandName}
          onChangeText={v => setP({ ...p, brandName: v })}
          placeholder={t('payment.brandName')}
          placeholderTextColor={c.subtext}
          style={{ borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card }}
        />

        <Text style={{ color: c.subtext }}>{t('payment.bankName') || 'Bank name'}</Text>
        <TextInput
          value={p.bankName}
          onChangeText={v => setP({ ...p, bankName: v })}
          placeholder={t('payment.bankName')}
          placeholderTextColor={c.subtext}
          style={{ borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card }}
        />

        <Text style={{ color: c.subtext }}>{t('payment.accountName') || 'Account holder'}</Text>
        <TextInput
          value={p.accountName}
          onChangeText={v => setP({ ...p, accountName: v })}
          placeholder={t('payment.accountName')}
          placeholderTextColor={c.subtext}
          style={{ borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card }}
        />

        <Text style={{ color: c.subtext }}>{t('payment.accountNumber') || 'Account number'}</Text>
        <TextInput
          value={p.accountNumber}
          onChangeText={v => setP({ ...p, accountNumber: v })}
          placeholder={t('payment.accountNumber')}
          placeholderTextColor={c.subtext}
          keyboardType="number-pad"
          style={{ borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card }}
        />

        <Text style={{ color: c.subtext }}>{t('payment.note') || 'Note (transfer content)'}</Text>
        <TextInput
          value={p.note}
          onChangeText={v => setP({ ...p, note: v })}
          placeholder={t('payment.note')}
          placeholderTextColor={c.subtext}
          style={{ borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card }}
        />
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('payment.logo') || 'Logo'}</Text>
        {p.logoPath ? (
          <Image source={{ uri: p.logoPath }} style={{ width: 120, height: 120, borderRadius: 8 }} />
        ) : (
          <Text style={{ color: c.subtext }}>{t('payment.logoHint') || 'Pick a square logo'}</Text>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={t('common.choose') || 'Choose'} onPress={() => pick('logoPath')} />
          {p.logoPath ? (
            <Button
              title={t('common.delete') || 'Remove'}
              variant="ghost"
              onPress={() => setP(prev => ({ ...prev, logoPath: undefined }))}
            />
          ) : null}
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('payment.qr') || 'QR code'}</Text>
        {p.qrPath ? (
          <Image source={{ uri: p.qrPath }} style={{ width: 160, height: 160, borderRadius: 8 }} />
        ) : (
          <Text style={{ color: c.subtext }}>{t('payment.qrHint') || 'Pick a bank/Pay QR'}</Text>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={t('common.choose') || 'Choose'} onPress={() => pick('qrPath')} />
          {p.qrPath ? (
            <Button
              title={t('common.delete') || 'Remove'}
              variant="ghost"
              onPress={() => setP(prev => ({ ...prev, qrPath: undefined }))}
            />
          ) : null}
        </View>
      </Card>

      <View
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: insets.bottom + 12,
          flexDirection: 'row',
          gap: 12,
          justifyContent: 'flex-end',
        }}
      >
        <Button
          title={t('common.cancel') || 'Clear'}
          variant="ghost"
          onPress={async () => {
            await clearPaymentProfile();
            setP({});
          }}
        />
        <Button title={t('common.save') || 'Save'} onPress={save} />
      </View>
    </ScrollView>
  );
}
