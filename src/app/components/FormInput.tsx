// src/app/components/FormInput.tsx
import React, { useState } from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { useThemeColors } from '../theme';

type Props = TextInputProps & {
  error?: boolean;
};

export default function FormInput({ style, error, ...rest }: Props) {
  const c = useThemeColors();
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      {...rest}
      style={[
        {
          paddingVertical: 8,
          color: c.text,
          borderBottomWidth: 0.3,
          borderBottomColor: error
            ? '#ef4444' // đỏ nếu có lỗi
            : focused
            ? '#0ea5e9' // xanh khi focus
            : c.subtext, // xám khi bình thường
        },
        style,
      ]}
      placeholderTextColor={c.subtext}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}
