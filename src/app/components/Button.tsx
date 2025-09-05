import React from 'react';
import {TouchableOpacity, Text} from 'react-native';
import {useThemeColors} from '../theme';
export default function Button({title,onPress,variant='primary'}:{title:string;onPress?:()=>void;variant?:'primary'|'danger'|'ghost'}){
  const c=useThemeColors();
  const bg=variant==='primary'?c.primary:variant==='danger'?c.danger:'transparent';
  const border=variant==='ghost'?{borderWidth:1,borderColor:c.border}:{ };
  return (<TouchableOpacity onPress={onPress} style={[{paddingVertical:8,paddingHorizontal:16,borderRadius:12,alignItems:'center',marginVertical:4,backgroundColor:bg}, border]}>
    <Text style={{fontWeight:'700', color: variant==='primary'? c.primaryText : c.text}}>{title}</Text>
  </TouchableOpacity>);
}