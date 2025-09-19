// src/app/components/AppFooter.tsx
import React from 'react';
import { View, Text } from 'react-native';
import { useThemeColors } from '../theme';
import { useTranslation } from 'react-i18next';

export default function AppFooter() {
  const c = useThemeColors();
  const { t } = useTranslation();

  return (
    <View style={{ alignItems: 'center', padding: 8, marginTop: 'auto' }}>
      <Text style={{ fontSize: 12, color: c.subtext }}>
        {t('brand.devBy')}
      </Text>
    </View>
  );
}
