import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Image, Alert, ScrollView, StyleSheet } from 'react-native';
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

  // style gạch chân mảnh
  const underlineInput = [
    styles.underlineInput,
    { borderBottomColor: c.border, color: c.text },
  ] as const;

  const pick = async (key: 'logoPath' | 'qrPath') => {
    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        includeExtra: false,
        selectionLimit: 1,
      });
      const uri = res.assets?.[0]?.uri;
      if (uri)
        setP(prev => ({
          ...prev,
          [key]: uri.startsWith('file://') ? uri : `file://${uri}`,
        }));
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
      {/* Banner lưu ý: nổi bật hơn */}
      <View style={{ position: 'relative' }}>
        <View
          style={{
            padding: 12,
            paddingLeft: 14,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: 'rgba(16,185,129,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(16,185,129,0.35)',
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(16,185,129,0.15)',
            }}
          >
            <Text style={{ fontSize: 18 }}>🧾</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '800', marginBottom: 2 }}>
              {t('payment.invoiceInfoTitle') || 'Lưu ý hóa đơn'}
            </Text>
            <Text style={{ color: c.subtext, lineHeight: 18 }}>
              {t('payment.invoiceInfo') ||
                'Thông tin thanh toán sẽ hiển thị trên hóa đơn gửi cho khách thuê'}
            </Text>
          </View>
        </View>

        {/* Thanh nhấn màu ở mé trái */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            backgroundColor: '#10B981',
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
          }}
        />
      </View>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>
          {t('payment.title') || 'Payment profile'}
        </Text>

        <Text style={{ color: c.subtext }}>
          {t('payment.brandName') || 'Brand / Business name'}
        </Text>
        <TextInput
          value={p.brandName}
          onChangeText={v => setP({ ...p, brandName: v })}
          placeholder={t('payment.brandName')}
          placeholderTextColor={c.subtext}
          selectionColor={c.text}
          style={underlineInput}
        />

        <Text style={{ color: c.subtext }}>{t('payment.bankName') || 'Bank name'}</Text>
        <TextInput
          value={p.bankName}
          onChangeText={v => setP({ ...p, bankName: v })}
          placeholder={t('payment.bankName')}
          placeholderTextColor={c.subtext}
          selectionColor={c.text}
          style={underlineInput}
        />

        <Text style={{ color: c.subtext }}>{t('payment.accountName') || 'Account holder'}</Text>
        <TextInput
          value={p.accountName}
          onChangeText={v => setP({ ...p, accountName: v })}
          placeholder={t('payment.accountName')}
          placeholderTextColor={c.subtext}
          selectionColor={c.text}
          style={underlineInput}
        />

        <Text style={{ color: c.subtext }}>{t('payment.accountNumber') || 'Account number'}</Text>
        <TextInput
          value={p.accountNumber}
          onChangeText={v => setP({ ...p, accountNumber: v })}
          placeholder={t('payment.accountNumber')}
          placeholderTextColor={c.subtext}
          keyboardType="number-pad"
          selectionColor={c.text}
          style={underlineInput}
        />

        <Text style={{ color: c.subtext }}>
          {t('payment.note') || 'Note (transfer content)'}
        </Text>
        <TextInput
          value={p.note}
          onChangeText={v => setP({ ...p, note: v })}
          placeholder={t('payment.note')}
          placeholderTextColor={c.subtext}
          selectionColor={c.text}
          style={underlineInput}
        />
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: c.text, fontWeight: '700' }}>
          {t('payment.logo') || 'Logo'}
        </Text>
        {p.logoPath ? (
          <Image source={{ uri: p.logoPath }} style={{ width: 120, height: 120, borderRadius: 8 }} />
        ) : (
          <Text style={{ color: c.subtext }}>
            {t('payment.logoHint') || 'Chọn ảnh logo (nên hình vuông)'}
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={t('common.choose') || 'Chọn'} onPress={() => pick('logoPath')} />
          {p.logoPath ? (
            <Button
              title={t('common.delete') || 'Xóa'}
              variant="ghost"
              onPress={() => setP(prev => ({ ...prev, logoPath: undefined }))}
            />
          ) : null}
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: c.text, fontWeight: '700' }}>
          {t('payment.qr') || 'Mã QR'}
        </Text>
        {p.qrPath ? (
          <Image source={{ uri: p.qrPath }} style={{ width: 160, height: 160, borderRadius: 8 }} />
        ) : (
          <Text style={{ color: c.subtext }}>
            {t('payment.qrHint') || 'Chọn ảnh QR ngân hàng/ví'}
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={t('common.choose') || 'Chọn'} onPress={() => pick('qrPath')} />
          {p.qrPath ? (
            <Button
              title={t('common.delete') || 'Xóa'}
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

const styles = StyleSheet.create({
  underlineInput: {
    paddingVertical: 8,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: 0.5, // mảnh hơn
    marginBottom: 10,
  },
});
