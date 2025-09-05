import React from 'react';
import {TouchableOpacity, View, Text} from 'react-native';
import {useThemeColors} from '../theme';
export default function ListItem({title,subtitle,onPress,right,onLongPress}:{title:string;subtitle?:string;onPress?:()=>void;right?:any;onLongPress?:()=>void}){
  const c=useThemeColors();
  return (<TouchableOpacity onPress={onPress} onLongPress={onLongPress} style={{paddingVertical:10,paddingHorizontal:12,borderWidth:1,borderColor:c.border,borderRadius:12,marginVertical:6,flexDirection:'row',alignItems:'center',gap:8}}>
    <View style={{flex:1}}>
      <Text style={{color:c.text,fontWeight:'600'}}>{title}</Text>
      {subtitle?<Text style={{color:c.subtext}}>{subtitle}</Text>:null}
    </View>
    {right}
  </TouchableOpacity>);
}