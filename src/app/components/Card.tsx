// src/app/components/Card.tsx
import React from 'react';
import {View, ViewProps} from 'react-native';
import {useThemeColors} from '../theme';

export default function Card({children, style, ...rest}: ViewProps) {
  const c = useThemeColors();
  return (
    <View {...rest} style={[{backgroundColor:c.card, borderRadius:12, padding:12, borderWidth:1, borderColor:'#1F2430'}, style]}>
      {children}
    </View>
  );
}
