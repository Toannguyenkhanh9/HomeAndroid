import React from 'react';
import {TextInput, Text, View, TextInputProps, ViewStyle} from 'react-native';
import {useThemeColors} from '../theme';

type Props = TextInputProps & {
  label?: string;
  error?: boolean;
  helperText?: string;
  containerStyle?: ViewStyle;
};
export default function Input({label, error, helperText, style, containerStyle, ...rest}: Props) {
  const c = useThemeColors();
  return (
    <View style={[{marginBottom:4}, containerStyle]}>
      {!!label && <Text style={{color:c.subtext, marginBottom:6}}>{label}</Text>}
      <TextInput
        {...rest}
        placeholderTextColor={c.subtext}
        style={[
          {borderWidth:1, borderColor: error ? '#ef4444' : '#2A2F3A', backgroundColor:c.card, color:c.text, padding:12, borderRadius:12},
          style as any
        ]}
      />
      {!!helperText && (
        <Text style={{color: error ? '#ef4444' : c.subtext, marginTop:6, fontSize:12}}>
          {helperText}
        </Text>
      )}
    </View>
  );
}
