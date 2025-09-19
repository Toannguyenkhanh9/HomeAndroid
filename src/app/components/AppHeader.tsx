// src/app/components/AppHeader.tsx
import React from 'react';
import { View, Text } from 'react-native';
import { useThemeColors } from '../theme';
import { useTranslation } from 'react-i18next';

export default function AppHeader() {
  const c = useThemeColors();
  const { t } = useTranslation();

  return (
    <View style={{ alignItems: 'center', paddingVertical: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>
        {t('brand.name')}
      </Text>
      <Text style={{ fontSize: 13, color: c.subtext, marginTop: 2 }}>
        {t('brand.slogan')}
      </Text>
    </View>
  );
}
