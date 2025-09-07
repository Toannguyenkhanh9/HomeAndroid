import React from 'react';
import {TouchableOpacity, Text, ViewStyle} from 'react-native';
import {useThemeColors} from '../theme';
export default function Button({title,onPress,variant='primary',style}:{title:string;onPress?:()=>void;variant?:'primary'|'danger'|'ghost';style?:ViewStyle}){
  const c=useThemeColors();
  const bg=variant==='primary'?c.primary:variant==='danger'?c.danger:'transparent';
  const border=variant==='ghost'?{borderWidth:1,borderColor:c.border}:{ };
  const color=variant==='ghost'?c.text: (variant==='primary'? c.primaryText:'#fff');
  return <TouchableOpacity onPress={onPress} style={[{paddingVertical:10,paddingHorizontal:14,borderRadius:12,backgroundColor:bg,alignSelf:'flex-start'}, border, style]}>
    <Text style={{color, fontWeight:'600'}}>{title}</Text>
  </TouchableOpacity>;
}
