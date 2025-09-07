import React from 'react';
import {View, Text} from 'react-native';
import {useThemeColors} from '../theme';
export default function Header({title,right}:{title:string;right?:any}){
  const c=useThemeColors();
  return (<View style={{flexDirection:'row',alignItems:'center',paddingVertical:8,marginBottom:8,borderBottomWidth:1,borderBottomColor:c.border}}>
    <Text style={{fontSize:20,fontWeight:'700',color:c.text,flex:1}}>{title}</Text>
    <View>{right}</View>
  </View>);
}
