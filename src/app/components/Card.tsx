// src/app/components/Card.tsx
import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { useThemeColors } from '../theme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function Card({ children, style }: Props) {
  const c = useThemeColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,   // màu nền theo theme
          borderRadius: 12,          // bo góc
          padding: 12,               // padding bên trong
          marginBottom: 12,          // khoảng cách giữa các Card
          borderWidth: 1,
          borderColor: c.border,     // màu viền mờ
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,              // Android shadow
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
