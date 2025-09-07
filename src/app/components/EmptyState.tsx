import React from 'react';
import {View, Text} from 'react-native';
import {useThemeColors} from '../theme';
export default function EmptyState({title,hint}:{title:string;hint?:string}){
  const c=useThemeColors();
  return (<View style={{alignItems:'center',paddingVertical:24}}>
    <Text style={{color:c.subtext,fontSize:16}}>{title}</Text>
    {hint?<Text style={{color:c.subtext,opacity:0.8,marginTop:4}}>{hint}</Text>:null}
  </View>);
}
