import React from 'react';
import {TouchableOpacity, Text, ViewStyle} from 'react-native';
import {useThemeColors} from '../theme';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: 'solid' | 'ghost';
  style?: ViewStyle; // <-- thêm
};

export default function Button({title, onPress, variant='solid', style}: Props) {
  const c = useThemeColors();
  const isGhost = variant === 'ghost';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[{
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
        backgroundColor: isGhost ? 'transparent' : c.primary,
        borderWidth: isGhost ? 1 : 0,
        borderColor: isGhost ? c.border : 'transparent',
      }, style]} // <-- nhận style từ ngoài
    >
      <Text style={{
        color: isGhost ? c.text : c.onPrimary,
        fontWeight: '700'
      }}>{title}</Text>
    </TouchableOpacity>
  );
}
