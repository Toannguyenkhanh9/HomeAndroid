import React from 'react';
import {View} from 'react-native';
import {useThemeColors} from '../theme';
export default function Card({children, style}:{children:any; style?:any}){ const c=useThemeColors(); return <View style={[{backgroundColor:c.card,borderColor:c.border,borderWidth:1,borderRadius:14,padding:12,marginVertical:6}, style]}>{children}</View>; }