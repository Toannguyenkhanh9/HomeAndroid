import React from 'react';
import {TextInput} from 'react-native';
import {useThemeColors} from '../theme';
export default function Input(p:any){ const c=useThemeColors(); return <TextInput placeholderTextColor={c.subtext} {...p} style={[{padding:8,borderRadius:10,borderWidth:1,borderColor:c.border,color:c.text}, p.style]} />;}