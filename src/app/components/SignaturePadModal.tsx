import React, { useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, Platform } from 'react-native';
import Signature from 'react-native-signature-canvas';
import { useThemeColors } from '../theme';
import {useTranslation} from 'react-i18next';
type Props = {
  visible: boolean;
  title?: string;
  onOK: (base64: string) => void;      // base64 (không prefix)
  onCancel: () => void;
};

export default function SignaturePadModal({ visible, title = 'Ký xác nhận', onOK, onCancel }: Props) {
  const c = useThemeColors();
  const ref = useRef<any>(null);
  const {t} = useTranslation();
  const handleOK = (sig: string) => {
    // sig có dạng base64 PNG không prefix
    onOK(sig);
  };

  const webStyle = `
    .m-signature-pad--footer { display: none; }
    body,html { background: ${c.bg}; }
    .m-signature-pad { box-shadow: none; border: 1px solid ${c.border}; }
  `;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: c.bg, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>{title}</Text>

          <View style={{ height: 260, borderRadius: 8, overflow: 'hidden' }}>
            <Signature
              ref={ref}
              onOK={handleOK}
              onEmpty={() => {}}
              descriptionText=""
              clearText= {t('common.remove')}
              confirmText= {t('common.save')}
              webStyle={webStyle}
              autoClear={false}
              backgroundColor={c.bg}
              imageType="image/png"
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
            <TouchableOpacity onPress={() => ref.current?.clearSignature?.()}>
              <Text style={{ color: c.subtext, fontWeight: '700' }}>{t('common.delete')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => ref.current?.readSignature?.()}>
              <Text style={{ color: c.text, fontWeight: '700' }}>{t('common.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancel}>
              <Text style={{ color: '#ef4444', fontWeight: '700' }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
